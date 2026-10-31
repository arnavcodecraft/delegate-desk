import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AtSign, Ban, Bell, CalendarDays, Hash, HelpCircle, Megaphone, MessageCircle, MessageSquareReply, MessagesSquare, Plus, Search, ThumbsUp, Users, X, CheckCircle2, MapPin, Star } from 'lucide-react';
import { api } from '../api';
import { ChatPane, chatApi, StatusPicker, formatText } from './ChatPane';

const seenKey = (token: string, ch: string) => `dd-chat-seen-${token.slice(0, 8)}-${ch}`;
const getSeen = (token: string, ch: string) => { try { return localStorage.getItem(seenKey(token, ch)); } catch { return null; } };
const setSeen = (token: string, ch: string, t: string) => { try { localStorage.setItem(seenKey(token, ch), t); } catch { /* private mode */ } };
const ago = (t: string) => { const s = (Date.now() - new Date(t).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
type View = 'activity' | 'chat' | 'qa' | 'schedule';

/** The delegate's Teamspace: Activity, conference chat (groups and private messages), Ask the EB, and the schedule. */
export function DelegateChat() {
  const { token = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const view = (sp.get('view') as View) || 'chat';
  const setView = (v: View) => { const n = new URLSearchParams(sp); n.set('view', v); setSp(n, { replace: true }); };
  const [inbox, setInbox] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string>('all');
  const [thread, setThread] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);   // a private chat not started yet
  const [picker, setPicker] = useState(false);
  const [mobileList, setMobileList] = useState(true);
  const base = `/api/public/r/${token}/chat`;
  const refresh = () => api.get<any>(base).then((d) => { setInbox(d); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  // The conversation on screen counts as read.
  useEffect(() => { const c = inbox?.channels.find((x: any) => x.key === active); if (c?.latest) setSeen(token, active, c.latest); }, [inbox, active, token]);
  const capi = useMemo(() => chatApi(base, {
    load: (c, o) => (c.startsWith('pending:') ? Promise.resolve([]) : chatApi(base).load(c, o)),
    post: async (p) => {
      if (p.channel.startsWith('pending:')) { const r = await api.post<any>(base, { ...p, channel: undefined, to: pending!.id }); await refresh(); setActive(r.channel); setPending(null); return r; }
      return api.post(base, p);
    },
  }), [base, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !inbox) return <div className="ch-page"><div className="ch-card ch-center"><h2>Chat isn’t available</h2><p>{err}</p><Link to={`/r/${token}`}>Back to your page</Link></div></div>;
  if (!inbox) return <div className="ch-page"><div className="ch-card ch-center">Loading…</div></div>;
  const ch = inbox.channels.find((c: any) => c.key === active);
  const dmWith = ch?.kind === 'dm' ? ch.with : pending && active === `new:${pending.id}` ? pending.id : null;
  const isBlocked = dmWith && inbox.blocked.includes(dmWith);
  const title = ch?.label ?? (pending ? pending.name : 'Chat');
  const open = (key: string, th: string | null = null) => { setView('chat'); setActive(key); setThread(th); setMobileList(false); const c = inbox.channels.find((x: any) => x.key === key); if (c?.latest) setSeen(token, key, c.latest); };
  const unread = (c: any) => c.latest && c.key !== active && (!getSeen(token, c.key) || getSeen(token, c.key)! < c.latest);
  const mentioned = (c: any) => c.mention && c.key !== active && (!getSeen(token, c.key) || getSeen(token, c.key)! < c.mention);
  const badge = (c: any) => mentioned(c) ? <i className="ch-at" aria-label="You were mentioned">@</i> : unread(c) ? <i className="ch-dot" aria-label="New messages" /> : null;
  const anyUnread = inbox.channels.some(unread);

  return (
    <div className="ch-page">
      <div className="ch-card ch-shell ts-shell">
        <nav className="ts-rail" aria-label="Teamspace">
          <Link to={`/r/${token}`} className="ts-rail-btn" aria-label="Back to your page" title="Back to your page"><ArrowLeft size={19} /></Link>
          {([['activity', Bell, 'Activity'], ['chat', MessagesSquare, 'Chat'], ['qa', HelpCircle, 'Ask the EB'], ['schedule', CalendarDays, 'Schedule']] as const).map(([k, I, l]) =>
            <button key={k} type="button" className={`ts-rail-btn ${view === k ? 'on' : ''}`} onClick={() => setView(k)} aria-current={view === k ? 'page' : undefined}><I size={19} /><span>{l}</span>{k === 'chat' && anyUnread && <i className="ch-dot" aria-label="New messages" />}</button>)}
        </nav>
        {view === 'chat' && <>
          <aside className={`ch-side ${mobileList ? '' : 'hide-m'}`}>
            <div className="ch-side-head"><b>Chat</b></div>
            <div className="ch-me">You appear as <b>{inbox.me.name}</b><StatusPicker base={base} status={inbox.me.status} onSaved={refresh} /></div>
            <div className="ch-group-label">Groups</div>
            {inbox.channels.filter((c: any) => c.kind === 'group').map((c: any) => <button key={c.key} className={`ch-item ${active === c.key ? 'on' : ''}`} onClick={() => open(c.key)}>
              {c.key === 'all' ? <Users size={16} /> : <Hash size={16} />}<span>{c.label}</span>{badge(c)}</button>)}
            {inbox.dms && <>
              <div className="ch-group-label">Private messages <button className="ch-new" onClick={() => setPicker(true)} aria-label="New private message"><Plus size={15} /></button></div>
              {inbox.channels.filter((c: any) => c.kind === 'dm').map((c: any) => <button key={c.key} className={`ch-item ${active === c.key ? 'on' : ''}`} onClick={() => open(c.key)}>
                <MessageCircle size={16} /><span>{c.label}</span>{badge(c)}</button>)}
              {pending && !inbox.channels.some((c: any) => c.with === pending.id) && <button className={`ch-item ${active === `new:${pending.id}` ? 'on' : ''}`} onClick={() => open(`new:${pending.id}`)}><MessageCircle size={16} /><span>{pending.name}</span></button>}
            </>}
            <p className="ch-rules">Be respectful: this is a conference space. Report anything that makes you uncomfortable; the conference team reviews reports.</p>
          </aside>
          <div className={`ch-main ${mobileList ? 'hide-m' : ''}`}>
            <button className="ch-mobile-back" onClick={() => setMobileList(true)}><ArrowLeft size={16} />Chats</button>
            <ChatPane key={active} channel={active.startsWith('new:') ? `pending:${active}` : active} title={title} api={capi} meWho={inbox.me.who} openThread={thread}
              subtitle={active === 'all' ? 'Every delegate at the conference' : active.startsWith('c:') ? 'Delegates in your committee and your EB' : 'Private: only the two of you'}
              moderator={active.startsWith('dm:')}
              onReport={async (m) => { const reason = prompt('Why are you reporting this message? (optional)'); if (reason === null) return; await api.post(`${base}/report`, { messageId: m.id, reason }); alert('Reported. The conference team will review it.'); }}
              disabled={isBlocked ? 'You blocked this delegate. Unblock them to send messages.' : null}
              actions={dmWith ? <button className="ch-block" onClick={async () => { await api.post(`${base}/block`, { id: dmWith, on: !isBlocked }); refresh(); }}><Ban size={14} />{isBlocked ? 'Unblock' : 'Block'}</button> : undefined}
            />
          </div>
        </>}
        {view === 'activity' && <Activity token={token} open={open} inbox={inbox} />}
        {view === 'qa' && <Questions token={token} />}
        {view === 'schedule' && <Schedule url={`/api/public/r/${token}/schedule`} />}
      </div>
      {picker && <DelegatePicker base={base} onClose={() => setPicker(false)} onPick={(d) => {
        setPicker(false);
        const existing = inbox.channels.find((c: any) => c.with === d.id);
        if (existing) open(existing.key); else { setPending(d); setView('chat'); setActive(`new:${d.id}`); setMobileList(false); }
      }} />}
    </div>
  );
}

const ICON: Record<string, typeof Bell> = { mention: AtSign, reply: MessageSquareReply, announcement: Megaphone, answer: CheckCircle2 };
const VERB: Record<string, string> = { mention: 'mentioned you', reply: 'replied to you', announcement: 'posted an announcement', answer: 'answered your question' };

function Activity({ token, open, inbox }: { token: string; open: (ch: string, thread?: string | null) => void; inbox: any }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { const load = () => api.get(`/api/public/r/${token}/activity`).then(setD).catch(() => setD({ items: [], upcoming: [] })); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [token]);
  const label = (ch: string) => inbox.channels.find((c: any) => c.key === ch)?.label ?? (ch.startsWith('dm:') ? 'Private message' : 'Chat');
  return (
    <div className="ts-view">
      <div className="ts-view-head"><h2>Activity</h2><p>Mentions, replies, announcements and answers from your EB.</p></div>
      <div className="ts-two">
        <div className="ts-feed">
          {!d ? <div className="ch-empty">Loading…</div> : !d.items.length ? <div className="ts-empty"><Bell size={28} /><b>Nothing yet</b><span>When someone mentions you, replies to you or the team posts an announcement, it shows here.</span></div>
            : d.items.map((it: any) => { const I = ICON[it.type] ?? Bell; return (
              <button key={it.type + it.id} type="button" className={`ts-act ${it.type}`} onClick={() => { if (it.type === 'answer') return; open(it.channel, it.type === 'announcement' ? null : it.parent_id ?? it.id); }}>
                <span className="ts-act-ic"><I size={16} /></span>
                <span className="ts-act-t"><span><b>{it.sender_name}</b> {VERB[it.type]}{it.channel ? <> in <b>{label(it.channel)}</b></> : null}</span>
                  {it.title && <strong>{it.title}</strong>}{it.question && <em>“{it.question}”</em>}<span className="ts-act-body">{formatText(it.body ?? '')}</span></span>
                <small>{ago(it.created_at)}</small>
              </button>); })}
        </div>
        <aside className="ts-side-card">
          <h3><CalendarDays size={16} /> Coming up</h3>
          {!d?.upcoming?.length ? <p className="ts-muted">Nothing scheduled yet.</p> : d.upcoming.map((s: any) => <ScheduleRow key={s.id} s={s} compact />)}
        </aside>
      </div>
    </div>
  );
}

function Questions({ token }: { token: string }) {
  const url = `/api/public/r/${token}/questions`;
  const [d, setD] = useState<any>(null);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'answered' | 'mine'>('open');
  const load = () => api.get(url).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = (d?.questions ?? []).filter((q: any) => filter === 'mine' ? q.mine : filter === 'answered' ? !!q.answer : !q.answer);
  return (
    <div className="ts-view">
      <div className="ts-view-head"><h2>Ask the EB</h2><p>{d?.committee ? <>Questions for the <b>{d.committee.name}</b> EB about procedure, the agenda or your portfolio. Upvote the ones you want answered too.</> : 'You can ask your EB once you have a committee.'}</p></div>
      {d?.committee && <form className="ts-ask" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.post(url, { body: text, anonymous: anon }); setText(''); setAnon(false); setFilter('mine'); load(); } catch (x: any) { setErr(x.message); } }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={2} placeholder="e.g. Can we move for an unmoderated caucus during the first session?" aria-label="Your question" />
        <div className="row between"><label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Hide my name from other delegates (the EB still sees it)</label><button className="btn primary" disabled={text.trim().length < 5}>Ask</button></div>
        {err && <div className="ch-err">{err}</div>}
      </form>}
      <div className="segmented" role="radiogroup" style={{ alignSelf: 'flex-start' }}>{([['open', 'Waiting'], ['answered', 'Answered'], ['mine', 'Mine']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <div className="ts-qs">
        {!d ? <div className="ch-empty">Loading…</div> : !qs.length ? <div className="ts-empty"><HelpCircle size={28} /><b>No questions here</b><span>{filter === 'open' ? 'Ask the first one.' : 'Nothing yet.'}</span></div>
          : qs.map((q: any) => <div key={q.id} className={`ts-q ${q.answer ? 'answered' : ''}`}>
            <button type="button" className={`ts-vote ${q.voted ? 'on' : ''}`} disabled={q.mine} onClick={async () => { await api.post(`${url}/${q.id}/vote`, {}); load(); }} aria-label={`Upvote (${q.votes})`} title={q.mine ? 'Your question' : 'Upvote'}><ThumbsUp size={15} /><b>{q.votes}</b></button>
            <div className="ts-q-t"><small>{q.asker} · {ago(q.created_at)}</small><p>{q.body}</p>
              {q.answer && <div className="ts-answer"><CheckCircle2 size={15} /><div><small>{q.answerer ?? 'EB'} answered</small><p>{q.answer}</p></div></div>}</div>
          </div>)}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { session: 'Committee session', ceremony: 'Ceremony', break: 'Break', social: 'Social', deadline: 'Deadline', meeting: 'Meeting' };
export function ScheduleRow({ s, compact, actions }: { s: any; compact?: boolean; actions?: React.ReactNode }) {
  const st = new Date(s.starts_at); const en = s.ends_at ? new Date(s.ends_at) : null;
  const t = Date.now(); const nowOn = st.getTime() <= t && (en ? en.getTime() : st.getTime() + 3600_000) > t;
  const hm = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={`ts-ev ${s.kind} ${nowOn ? 'now' : ''} ${compact ? 'compact' : ''}`}>
      <div className="ts-ev-time"><b>{hm(st)}</b>{en && <span>{hm(en)}</span>}{compact && <small>{st.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>}</div>
      <div className="ts-ev-t"><div className="row" style={{ gap: 6 }}>{nowOn && <span className="ts-now">Now</span>}<b>{s.title}</b></div>
        <small>{KIND_LABEL[s.kind] ?? s.kind}{s.short ? ` · ${s.short}` : ''}{s.location ? <> · <MapPin size={11} style={{ verticalAlign: -1 }} /> {s.location}</> : null}</small>
        {!compact && s.notes && <p>{s.notes}</p>}</div>
      {actions}
    </div>
  );
}
export function groupByDay(items: any[]) {
  const g: { day: string; items: any[] }[] = [];
  for (const s of items) { const day = new Date(s.starts_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }); const last = g[g.length - 1]; if (last?.day === day) last.items.push(s); else g.push({ day, items: [s] }); }
  return g;
}
function Schedule({ url }: { url: string }) {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api.get<any[]>(url).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ts-view">
      <div className="ts-view-head"><h2>Schedule</h2><p>Committee sessions, ceremonies, breaks and deadlines for you and your committee.</p></div>
      {!items ? <div className="ch-empty">Loading…</div> : !items.length ? <div className="ts-empty"><CalendarDays size={28} /><b>No schedule yet</b><span>The conference team will publish it here.</span></div>
        : groupByDay(items).map((g) => <section key={g.day} className="ts-day"><h3>{g.day}</h3>{g.items.map((s) => <ScheduleRow key={s.id} s={s} actions={s.kind === 'session' || s.kind === 'break' ? undefined
          : <button type="button" className={`ts-rsvp ${s.interested ? 'on' : ''}`} aria-pressed={s.interested} onClick={async () => { await api.post(`${url}/${s.id}/interested`, {}); load(); }}><Star size={14} />{s.interested ? 'Interested' : 'Interested?'}{s.going > 0 && <b>{s.going}</b>}</button>} />)}</section>)}
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
