import { useEffect, useMemo, useState } from 'react';
import { Hash, Users, Flag, Settings2, Lock, Megaphone, Briefcase } from 'lucide-react';
import { api } from '../api';
import { dt } from '../format';
import { Alert, Btn, Field, Loading, Modal, Switch, Tabs, useAsync, useToast } from '../ui';
import { PageHead, useStaff } from './Shell';
import { ChatPane, chatApi, StatusPicker } from '../chat/ChatPane';
import { CallButtons, CallRoom, type CallTarget } from '../calls/CallRoom';

const seen = (k: string) => { try { return localStorage.getItem(`dd-staff-seen-${k}`) ?? ''; } catch { return ''; } };
const markSeen = (k: string) => { try { localStorage.setItem(`dd-staff-seen-${k}`, new Date().toISOString()); } catch { /* private mode */ } };

/** Conference chat for the team: read and post in the group channels, remove messages, handle reports, switch chat on or off. */
export function ChatAdmin() {
  const { eventId, can } = useStaff();
  const toast = useToast();
  const data = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/chat`), [eventId]);
  const [tab, setTab] = useState<'chat' | 'reports' | 'settings'>('chat');
  const [active, setActive] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState(false);
  const callsBase = `/api/admin/events/${eventId}/calls`;
  const [calls, setCalls] = useState<any[]>([]);
  const [inCall, setInCall] = useState<CallTarget | null>(null);
  useEffect(() => { const load = () => api.get<any[]>(callsBase).then(setCalls).catch(() => setCalls([])); load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [callsBase]);
  const callFor = (ch: string) => calls.find((c) => c.key === `ch:${ch}`);
  const base = `/api/admin/events/${eventId}/chat`;
  const capi = useMemo(() => chatApi(base, { close: (id) => api.post(`${base}/messages/${id}/close`, {}) }), [base]);
  if (!data.data) return <Loading />;
  const d = data.data;
  const all = [...d.team, ...d.channels];
  const channel = active ?? d.team[0]?.key ?? d.channels[0]?.key ?? null;
  const ch = all.find((c: any) => c.key === channel);
  const admin = can('event.config');
  const isTeam = channel === 'staff' || channel?.startsWith('eb:') || channel?.startsWith('team:');
  return (
    <div className="stack">
      <PageHead title="Chat" subtitle="Your team’s channels (the whole team, a private EB channel per committee, and channels like Logistics or Press) and the delegate groups. Reply in threads, react, @mention, pin, post announcements and run polls. Private messages between delegates are only visible to you when reported.">
        {admin && <Btn icon={Megaphone} onClick={() => setBroadcast(true)}>Announce to all groups</Btn>}
      </PageHead>
      {!d.settings.enabled && <Alert tone="warn">Chat is turned off for delegates: they don't see it. Your team channels still work. {admin && <>Turn it on under <b>Settings</b> below.</>}</Alert>}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'chat', label: 'Channels' }, ...(admin ? [{ key: 'reports' as const, label: `Reports${d.reports ? ` (${d.reports})` : ''}` }, { key: 'settings' as const, label: 'Settings' }] : [])]} />
      {tab === 'chat' && (!channel ? <Alert tone="info">Add committees first; each one gets its own group.</Alert> : <div className="ch-card ch-shell staff">
        <aside className="ch-side">
          <div className="ch-me">You appear as <b>{d.me.name}</b><StatusPicker base={base} status={d.me.status} onSaved={data.reload} /></div>
          <div className="ch-group-label">Your team</div>
          {d.team.map((c: any) => <button key={c.key} className={`ch-item ${channel === c.key ? 'on' : ''}`} onClick={() => { markSeen(`${eventId}-${c.key}`); setActive(c.key); }} title={c.description}>{c.key === 'staff' ? <Users size={16} /> : c.key.startsWith('eb:') ? <Lock size={16} /> : <Briefcase size={16} />}<span>{c.label}</span>{callFor(c.key) && <i className="call-live" title="Call going on" />}{c.mention && c.key !== channel && c.mention > seen(`${eventId}-${c.key}`) ? <i className="ch-at" aria-label="You were mentioned">@</i> : <span className="ch-count">{c.count || ''}</span>}</button>)}
          <div className="ch-group-label">Delegate groups</div>
          {d.channels.map((c: any) => <button key={c.key} className={`ch-item ${channel === c.key ? 'on' : ''}`} onClick={() => { markSeen(`${eventId}-${c.key}`); setActive(c.key); }}>{c.key === 'all' ? <Users size={16} /> : <Hash size={16} />}<span>{c.label}</span>{callFor(c.key) && <i className="call-live" title="Call going on" />}{c.mention && c.key !== channel && c.mention > seen(`${eventId}-${c.key}`) ? <i className="ch-at" aria-label="You were mentioned">@</i> : <span className="ch-count">{c.count || ''}</span>}</button>)}
          {admin && <p className="ch-rules">Set up channels like Logistics or Press under <a href="/app/teamspace?tab=channels">Teamspace → Team channels</a>.</p>}
        </aside>
        <div className="ch-main">
          <ChatPane key={channel} channel={channel} title={ch?.label ?? ''} api={capi} meWho={d.me.who} rich moderator slowOptions={d.slowOptions} actions={d.settings.calls !== false ? <CallButtons joined={inCall?.key === `ch:${channel}`} active={callFor(channel)} onStart={(kind) => setInCall({ key: `ch:${channel}`, title: ch?.label ?? 'Call', kind })} /> : undefined}
            onSlow={(seconds) => api.post(`${base}/slow`, { channel, seconds }).then(() => toast(seconds ? `Slow mode: ${seconds} s` : 'Slow mode off', 'ok'))}
            subtitle={ch?.description ?? (channel === 'all' ? 'Every delegate at the conference' : 'Delegates in this committee and its EB')}
            onRemove={isTeam ? undefined : async (m) => { if (!confirm(`Remove this message from ${m.sender_name}?`)) return; try { await api.post(`${base}/messages/${m.id}/remove`); toast('Removed', 'ok'); } catch (e: any) { toast(e.message, 'bad'); } }} />
        </div>
      </div>)}
      {inCall && <CallRoom key={inCall.key} base={callsBase} target={inCall} onClose={() => setInCall(null)} />}
      {broadcast && <Broadcast base={base} count={d.channels.length} onClose={() => setBroadcast(false)} />}
      {tab === 'reports' && <Reports base={base} onChange={data.reload} />}
      {tab === 'settings' && <div className="card stack">
        <h3><Settings2 className="icon" /> Chat settings</h3>
        <Switch checked={d.settings.enabled} onChange={async (on) => { await api.post(`${base}/settings`, { enabled: on }); toast(on ? 'Chat is on' : 'Chat is off', 'ok'); data.reload(); }} label="Conference chat (All committees and committee groups)" />
        <Switch checked={d.settings.dms} onChange={async (on) => { await api.post(`${base}/settings`, { dms: on }); toast(on ? 'Private messages are on' : 'Private messages are off', 'ok'); data.reload(); }} label="Private messages between delegates" />
        <Switch checked={d.settings.calls !== false} onChange={async (on) => { await api.post(`${base}/settings`, { calls: on }); toast(on ? 'Calls are on' : 'Calls are off', 'ok'); data.reload(); }} label="Audio and video calls in groups and team channels, and online meetings" />
        <Switch checked={!!d.settings.dmCalls} onChange={async (on) => { await api.post(`${base}/settings`, { dmCalls: on }); toast(on ? 'Calls in private messages are on' : 'Calls in private messages are off', 'ok'); data.reload(); }} label="Calls between two delegates in private messages" />
        <p className="small muted" style={{ margin: 0 }}>Many delegates are under 18. If your school partners prefer, keep private messages and private calls off: delegates can still talk and call in the groups, where your team can see who is there.</p>
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

function Broadcast({ base, count, onClose }: { base: string; count: number; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal title="Announce to all delegate groups" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon={Megaphone} disabled={busy || !body.trim()} onClick={async () => { setBusy(true); try { const r = await api.post<any>(`${base}/broadcast`, { title, body }); toast(`Posted in ${r.sent} groups`, 'ok'); onClose(); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } }}>Post in {count} groups</Btn></>}>
      <div className="stack">
        <Field label="Headline (optional)"><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Opening ceremony moved to 9:30" /></Field>
        <Field label="Announcement"><textarea rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <p className="small muted" style={{ margin: 0 }}>It appears highlighted in All committees and in every committee group, and in each delegate’s Activity.</p>
      </div>
    </Modal>
  );
}
