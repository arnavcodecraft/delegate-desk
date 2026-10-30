import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Hash, MessageCircle, Plus, Search, Users, X } from 'lucide-react';
import { api } from '../api';
import { ChatPane, type ChatMessage } from './ChatPane';

const seenKey = (token: string, ch: string) => `dd-chat-seen-${token.slice(0, 8)}-${ch}`;
const getSeen = (token: string, ch: string) => { try { return localStorage.getItem(seenKey(token, ch)); } catch { return null; } };
const setSeen = (token: string, ch: string, t: string) => { try { localStorage.setItem(seenKey(token, ch), t); } catch { /* private mode */ } };

/** The delegate's conference chat: All committees, their committee, and private messages. */
export function DelegateChat() {
  const { token = '' } = useParams();
  const [inbox, setInbox] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string>('all');
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);   // a private chat not started yet
  const [picker, setPicker] = useState(false);
  const [mobileList, setMobileList] = useState(true);
  const base = `/api/public/r/${token}/chat`;
  const refresh = () => api.get<any>(base).then((d) => { setInbox(d); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  // The conversation on screen counts as read.
  useEffect(() => { const c = inbox?.channels.find((x: any) => x.key === active); if (c?.latest) setSeen(token, active, c.latest); }, [inbox, active, token]);

  if (err && !inbox) return <div className="ch-page"><div className="ch-card ch-center"><h2>Chat isn’t available</h2><p>{err}</p><Link to={`/r/${token}`}>Back to your page</Link></div></div>;
  if (!inbox) return <div className="ch-page"><div className="ch-card ch-center">Loading chat…</div></div>;
  const ch = inbox.channels.find((c: any) => c.key === active);
  const dmWith = ch?.kind === 'dm' ? ch.with : pending && active === `new:${pending.id}` ? pending.id : null;
  const isBlocked = dmWith && inbox.blocked.includes(dmWith);
  const title = ch?.label ?? (pending ? pending.name : 'Chat');
  const open = (key: string) => { setActive(key); setMobileList(false); const c = inbox.channels.find((x: any) => x.key === key); if (c?.latest) setSeen(token, key, c.latest); };
  const unread = (c: any) => c.latest && c.key !== active && (!getSeen(token, c.key) || getSeen(token, c.key)! < c.latest);

  return (
    <div className="ch-page">
      <div className="ch-card ch-shell">
        <aside className={`ch-side ${mobileList ? '' : 'hide-m'}`}>
          <div className="ch-side-head"><Link to={`/r/${token}`} className="ch-back" aria-label="Back to your page"><ArrowLeft size={18} /></Link><b>Conference chat</b></div>
          <div className="ch-me">You appear as <b>{inbox.me.name}</b></div>
          <div className="ch-group-label">Groups</div>
          {inbox.channels.filter((c: any) => c.kind === 'group').map((c: any) => <button key={c.key} className={`ch-item ${active === c.key ? 'on' : ''}`} onClick={() => open(c.key)}>
            {c.key === 'all' ? <Users size={16} /> : <Hash size={16} />}<span>{c.label}</span>{unread(c) && <i className="ch-dot" aria-label="New messages" />}</button>)}
          {inbox.dms && <>
            <div className="ch-group-label">Private messages <button className="ch-new" onClick={() => setPicker(true)} aria-label="New private message"><Plus size={15} /></button></div>
            {inbox.channels.filter((c: any) => c.kind === 'dm').map((c: any) => <button key={c.key} className={`ch-item ${active === c.key ? 'on' : ''}`} onClick={() => open(c.key)}>
              <MessageCircle size={16} /><span>{c.label}</span>{unread(c) && <i className="ch-dot" aria-label="New messages" />}</button>)}
            {pending && !inbox.channels.some((c: any) => c.with === pending.id) && <button className={`ch-item ${active === `new:${pending.id}` ? 'on' : ''}`} onClick={() => open(`new:${pending.id}`)}><MessageCircle size={16} /><span>{pending.name}</span></button>}
          </>}
          <p className="ch-rules">Be respectful: this is a conference space. Report anything that makes you uncomfortable; the conference team reviews reports.</p>
        </aside>
        <div className={`ch-main ${mobileList ? 'hide-m' : ''}`}>
          <button className="ch-mobile-back" onClick={() => setMobileList(true)}><ArrowLeft size={16} />Chats</button>
          <ChatPane key={active} channel={active.startsWith('new:') ? `pending:${active}` : active} title={title}
            subtitle={active === 'all' ? 'Every delegate at the conference' : active.startsWith('c:') ? 'Delegates in your committee and your EB' : 'Private: only the two of you'}
            meId={inbox.me.id}
            load={async (c, since) => c.startsWith('pending:') ? [] : api.get<ChatMessage[]>(`${base}/messages?channel=${encodeURIComponent(c)}${since ? `&since=${encodeURIComponent(since)}` : ''}`)}
            post={async (body) => {
              if (active.startsWith('new:')) { const r = await api.post<any>(base, { to: pending!.id, body }); await refresh(); setActive(r.channel); setPending(null); }
              else await api.post(base, { channel: active, body });
            }}
            onReport={async (m) => { const reason = prompt('Why are you reporting this message? (optional)'); if (reason === null) return; await api.post(`${base}/report`, { messageId: m.id, reason }); alert('Reported. The conference team will review it.'); }}
            disabled={isBlocked ? 'You blocked this delegate. Unblock them to send messages.' : null}
            actions={dmWith ? <button className="ch-block" onClick={async () => { await api.post(`${base}/block`, { id: dmWith, on: !isBlocked }); refresh(); }}><Ban size={14} />{isBlocked ? 'Unblock' : 'Block'}</button> : undefined}
          />
        </div>
      </div>
      {picker && <DelegatePicker base={base} onClose={() => setPicker(false)} onPick={(d) => {
        setPicker(false);
        const existing = inbox.channels.find((c: any) => c.with === d.id);
        if (existing) open(existing.key); else { setPending(d); setActive(`new:${d.id}`); setMobileList(false); }
      }} />}
    </div>
  );
}

function DelegatePicker({ base, onClose, onPick }: { base: string; onClose: () => void; onPick: (d: { id: string; name: string }) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get<any[]>(`${base}/directory`).then(setList).catch((e) => setErr(e.message)); }, [base]);
  const shown = useMemo(() => (list ?? []).filter((d) => d.name.toLowerCase().includes(q.toLowerCase())), [list, q]);
  return (
    <div className="ch-modal" role="dialog" aria-modal="true" aria-label="New private message" onClick={onClose}>
      <div className="ch-card ch-picker" onClick={(e) => e.stopPropagation()}>
        <div className="ch-picker-head"><b>Message a delegate</b><button className="ch-act" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <label className="ch-search"><Search size={16} /><input autoFocus placeholder="Search by country, committee or name" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {err && <div className="ch-err">{err}</div>}
        <div className="ch-picker-list">{!list ? <div className="ch-empty">Loading…</div> : !shown.length ? <div className="ch-empty">No delegates match.</div>
          : shown.map((d) => <button key={d.id} className="ch-item" onClick={() => onPick(d)}><MessageCircle size={16} /><span>{d.name}</span></button>)}</div>
      </div>
    </div>
  );
}
