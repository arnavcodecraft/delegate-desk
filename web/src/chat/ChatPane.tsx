import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Flag, Trash2, MessageSquareReply, Pin, PinOff, Pencil, SmilePlus, Search, X, Megaphone, BarChart3, Lock, Plus, Check, Users, Timer } from 'lucide-react';
import { api } from '../api';

export interface ChatMessage {
  id: string; channel: string; parent_id: string | null; kind: 'message' | 'announcement' | 'poll'; title: string | null;
  sender_kind: 'delegate' | 'staff'; sender_id: string; sender_name: string; body: string; created_at: string; rev: string;
  edited_at: string | null; pinned_at: string | null; deleted: boolean; tag?: string;
  mentions: { id: string; name: string }[]; reactions: { emoji: string; count: number; mine: boolean }[];
  replies: number; last_reply_at: string | null;
  poll: { options: string[]; closed: boolean; counts: number[]; mine: number | null } | null;
}
export interface Member { id: string; name: string; kind: 'delegate' | 'staff'; online?: boolean; tag?: string; status?: { emoji: string; text: string } | null }
export interface PostInput { channel: string; body: string; parent?: string | null; kind?: 'message' | 'announcement' | 'poll'; title?: string; poll?: { options: string[] }; mentions?: { id: string; name: string }[] }

/** The calls a chat pane makes. Delegates and the team use the same shapes under different base addresses. */
export interface ChatApi {
  load: (channel: string, o: { since?: string | null; thread?: string | null; q?: string | null }) => Promise<ChatMessage[]>;
  pins: (channel: string) => Promise<ChatMessage[]>;
  members: (channel: string) => Promise<Member[]>;
  post: (p: PostInput) => Promise<any>;
  react: (id: string, emoji: string) => Promise<any>;
  vote: (id: string, option: number) => Promise<any>;
  pin: (id: string, on: boolean) => Promise<any>;
  edit: (id: string, body: string) => Promise<any>;
  del: (id: string) => Promise<any>;
  close?: (id: string) => Promise<any>;
  ping?: (channel: string, typing: boolean) => Promise<{ typing: string[]; online: string[]; slow: number }>;
  roster?: (channel: string) => Promise<Member[]>;
}
const enc = encodeURIComponent;
export function chatApi(base: string, extra: Partial<ChatApi> = {}): ChatApi {
  return {
    load: (c, o) => api.get(`${base}/messages?channel=${enc(c)}${o.since ? `&since=${enc(o.since)}` : ''}${o.thread ? `&thread=${enc(o.thread)}` : ''}${o.q ? `&q=${enc(o.q)}` : ''}`),
    pins: (c) => api.get(`${base}/pins?channel=${enc(c)}`),
    members: (c) => api.get(`${base}/members?channel=${enc(c)}`),
    post: (p) => api.post(base, p),
    react: (id, emoji) => api.post(`${base}/messages/${id}/react`, { emoji }),
    vote: (id, option) => api.post(`${base}/messages/${id}/vote`, { option }),
    pin: (id, on) => api.post(`${base}/messages/${id}/pin`, { on }),
    edit: (id, body) => api.patch(`${base}/messages/${id}`, { body }),
    del: (id) => api.del(`${base}/messages/${id}`),
    ping: (c, typing) => api.post(`${base}/ping`, { channel: c, typing }),
    roster: (c) => api.get(`${base}/roster?channel=${enc(c)}`),
    ...extra,
  };
}

const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '😮', '👏', '🙏', '✅'];
const time = (t: string) => new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayOf = (t: string) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const whoOf = (m: ChatMessage) => `${m.sender_kind === 'delegate' ? 'd' : 'u'}:${m.sender_id}`;
const initials = (n: string) => n.replace(/\(.*?\)/g, '').split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Keep a list of messages fresh: a full load, then only what changed (new, edited, reacted, voted, removed) every few seconds. */
function useMessages(api: ChatApi, channel: string, thread: string | null) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const rev = useRef<string | null>(null);
  const merge = (got: ChatMessage[]) => {
    if (!got.length) return;
    setMsgs((m) => { const map = new Map(m.map((x) => [x.id, x])); for (const g of got) map.set(g.id, g); return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); });
    const top = got.reduce((t, g) => (g.rev > t ? g.rev : t), rev.current ?? '');
    rev.current = top || rev.current;
  };
  const refresh = async () => { try { merge(await api.load(channel, { since: rev.current, thread })); setErr(null); } catch (e: any) { setErr(e.message); } };
  useEffect(() => {
    let stop = false;
    setMsgs([]); rev.current = null;
    api.load(channel, { thread }).then((got) => { if (!stop) { setMsgs(got); rev.current = got.reduce((t, g) => (g.rev > t ? g.rev : t), '') || null; setErr(null); } }).catch((e) => !stop && setErr(e.message));
    const t = setInterval(() => { if (!stop) refresh(); }, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [channel, thread]); // eslint-disable-line react-hooks/exhaustive-deps
  return { msgs, err, setErr, refresh };
}

/** Light formatting, as people type it in Discord: **bold**, *italic*, `code`, ||spoiler|| and links. */
const FMT = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\|\|[^|\n]+\|\||\*[^*\s][^*\n]*\*|https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
function Spoiler({ children }: { children: React.ReactNode }) { const [show, setShow] = useState(false); return <span role="button" tabIndex={0} className={`ch-spoiler ${show ? 'show' : ''}`} onClick={() => setShow(true)} onKeyDown={(e) => e.key === 'Enter' && setShow(true)} aria-label={show ? undefined : 'Spoiler: select to show'}>{children}</span>; }
export function formatText(text: string, key = ''): React.ReactNode[] {
  return text.split(FMT).map((part, i) => {
    const k = `${key}${i}`;
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={k} className="ch-code">{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={k}>{part.slice(2, -2)}</b>;
    if (part.startsWith('||') && part.endsWith('||') && part.length > 4) return <Spoiler key={k}>{part.slice(2, -2)}</Spoiler>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <i key={k}>{part.slice(1, -1)}</i>;
    if (/^https?:\/\//.test(part)) return <a key={k} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>;
    return <span key={k}>{part}</span>;
  });
}
/** Message text with formatting and @mentions highlighted (and the viewer's own mention stronger). */
function Body({ m, meWho }: { m: ChatMessage; meWho: string }) {
  if (!m.mentions.length) return <>{formatText(m.body)}</>;
  const names = [...m.mentions].sort((a, b) => b.name.length - a.name.length);
  const re = new RegExp(`(${names.map((n) => `@${n.name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{m.body.split(re).map((part, i) => { const hit = names.find((n) => `@${n.name}` === part); return hit ? <span key={i} className={`ch-mention ${hit.id === meWho ? 'me' : ''}`}>{part}</span> : <span key={i}>{formatText(part, `${i}-`)}</span>; })}</>;
}

function Poll({ m, api, refresh, canClose }: { m: ChatMessage; api: ChatApi; refresh: () => void; canClose: boolean }) {
  const p = m.poll!;
  const total = p.counts.reduce((a, b) => a + b, 0);
  return (
    <div className="ch-poll">
      <div className="ch-poll-q"><BarChart3 size={15} />{m.body}</div>
      {p.options.map((o, i) => {
        const pct = total ? Math.round((p.counts[i] / total) * 100) : 0;
        return <button key={i} type="button" className={`ch-poll-opt ${p.mine === i ? 'on' : ''}`} disabled={p.closed} onClick={async () => { await api.vote(m.id, i); refresh(); }}>
          <i style={{ width: `${pct}%` }} /><span>{p.mine === i && <Check size={13} />}{o}</span><b>{pct}%</b>
        </button>;
      })}
      <div className="ch-poll-foot">{total} vote{total === 1 ? '' : 's'}{p.closed ? ' · closed' : p.mine !== null ? ' · you can change your vote' : ''}
        {canClose && !p.closed && api.close && <button type="button" className="ch-link" onClick={async () => { await api.close!(m.id); refresh(); }}><Lock size={12} /> Close poll</button>}</div>
    </div>
  );
}

/** Write a message: Enter sends, Shift+Enter is a new line, @ mentions someone in the channel. Team members can also post announcements and polls. */
function Composer({ channel, api, parent, rich, onSent, placeholder, onTyping }: { channel: string; api: ChatApi; parent?: string | null; rich?: boolean; onSent: () => void; placeholder?: string; onTyping?: () => void }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'message' | 'announcement' | 'poll'>('message');
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [people, setPeople] = useState<Member[] | null>(null);
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setPeople(null); setMentions([]); setText(''); setMode('message'); }, [channel]);
  const matches = useMemo(() => (query === null || !people ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 7)), [people, query]);
  const onType = (v: string) => {
    setText(v);
    if (v) onTyping?.();
    const caret = box.current?.selectionStart ?? v.length;
    const at = /(^|\s)@([^@\n]{0,30})$/.exec(v.slice(0, caret));
    if (at) { setQuery(at[2]); setPick(0); if (!people) api.members(channel).then(setPeople).catch(() => setPeople([])); } else setQuery(null);
  };
  const choose = (p: Member) => {
    const caret = box.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^@\n]{0,30})$/, `@${p.name} `);
    setText(before + text.slice(caret));
    setMentions((m) => (m.some((x) => x.id === p.id) ? m : [...m, { id: p.id, name: p.name }]));
    setQuery(null);
    setTimeout(() => { box.current?.focus(); box.current?.setSelectionRange(before.length, before.length); });
  };
  const send = async () => {
    if (busy || !text.trim()) return;
    setBusy(true); setErr(null);
    try {
      await api.post({ channel, body: text.trim(), parent: parent ?? null, kind: mode, title: mode === 'announcement' ? title : undefined, poll: mode === 'poll' ? { options: options.filter((o) => o.trim()) } : undefined, mentions: mentions.filter((m) => text.includes(`@${m.name}`)) });
      setText(''); setTitle(''); setOptions(['', '']); setMentions([]); setMode('message'); onSent();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className={`ch-compose ${mode !== 'message' ? 'rich' : ''}`}>
      {err && <div className="ch-err" role="alert">{err}</div>}
      {rich && !parent && <div className="ch-modes" role="radiogroup" aria-label="What to post">
        <button type="button" role="radio" aria-checked={mode === 'message'} className={mode === 'message' ? 'on' : ''} onClick={() => setMode('message')}>Message</button>
        <button type="button" role="radio" aria-checked={mode === 'announcement'} className={mode === 'announcement' ? 'on' : ''} onClick={() => setMode('announcement')}><Megaphone size={13} /> Announcement</button>
        <button type="button" role="radio" aria-checked={mode === 'poll'} className={mode === 'poll' ? 'on' : ''} onClick={() => setMode('poll')}><BarChart3 size={13} /> Poll</button>
      </div>}
      {mode === 'announcement' && <input className="ch-title-in" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Headline (optional)" aria-label="Announcement headline" />}
      <div className="ch-form">
        {query !== null && matches.length > 0 && <div className="ch-mentions" role="listbox" aria-label="People to mention">
          {matches.map((p, i) => <button key={p.id} type="button" role="option" aria-selected={i === pick} className={i === pick ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); choose(p); }}><span className={`ch-av sm ${p.kind}`}>{initials(p.name)}</span>{p.name}</button>)}
        </div>}
        <textarea ref={box} rows={mode === 'message' ? 1 : 2} value={text} maxLength={2000} aria-label={mode === 'poll' ? 'Poll question' : 'Message'}
          placeholder={mode === 'poll' ? 'Ask a question…' : mode === 'announcement' ? 'Write the announcement…' : placeholder ?? 'Write a message… (@ to mention)'}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (query !== null && matches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPick((pick + 1) % matches.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPick((pick - 1 + matches.length) % matches.length); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[pick]); return; }
              if (e.key === 'Escape') { setQuery(null); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey && mode === 'message') { e.preventDefault(); send(); }
          }} />
        <button type="button" className="ch-send" disabled={busy || !text.trim()} onClick={send} aria-label="Send"><Send size={18} /></button>
      </div>
      {mode === 'poll' && <div className="ch-poll-edit">
        {options.map((o, i) => <div key={i} className="row"><input value={o} maxLength={80} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} onChange={(e) => setOptions(options.map((x, k) => (k === i ? e.target.value : x)))} />{options.length > 2 && <button type="button" className="ch-act" aria-label="Remove option" onClick={() => setOptions(options.filter((_, k) => k !== i))}><X size={14} /></button>}</div>)}
        {options.length < 6 && <button type="button" className="ch-link" onClick={() => setOptions([...options, ''])}><Plus size={13} /> Add option</button>}
      </div>}
    </div>
  );
}

/** One message with its reactions and actions. */
function Message({ m, meWho, api, refresh, onThread, moderator, onReport, onRemove, inThread }: {
  m: ChatMessage; meWho: string; api: ChatApi; refresh: () => void; onThread?: (m: ChatMessage) => void; moderator?: boolean;
  onReport?: (m: ChatMessage) => void; onRemove?: (m: ChatMessage) => void; inThread?: boolean;
}) {
  const mine = whoOf(m) === meWho;
  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); } catch (e: any) { alert(e.message); } };
  const mentioned = m.mentions.some((x) => x.id === meWho);
  const reactions = DEFAULT_REACTIONS;
  return (
    <div className={`ch-row ${m.kind} ${mine ? 'mine' : ''} ${m.sender_kind === 'staff' ? 'staff' : ''} ${mentioned ? 'mentioned' : ''}`}>
      <span className={`ch-av ${m.sender_kind}`} aria-hidden="true">{initials(m.sender_name)}</span>
      <div className="ch-col">
        <div className="ch-top"><b>{m.sender_name}</b>{m.tag && m.tag !== 'Delegate' && <span className={`ch-tag ${m.tag.toLowerCase()}`}>{m.tag}</span>}<span>{time(m.created_at)}</span>{m.edited_at && !m.deleted && <span>· edited</span>}{m.pinned_at && <span className="ch-pinned-tag"><Pin size={11} /> Pinned</span>}</div>
        {m.kind === 'announcement' && !m.deleted && <div className="ch-ann-tag"><Megaphone size={13} /> Announcement</div>}
        {m.deleted ? <div className="ch-bubble"><i className="ch-deleted">This message was removed</i></div>
          : editing !== null ? <div className="ch-edit"><textarea value={editing} onChange={(e) => setEditing(e.target.value)} aria-label="Edit message" autoFocus rows={2} />
            <div className="row"><button type="button" className="btn sm primary" onClick={() => act(async () => { await api.edit(m.id, editing); setEditing(null); })}>Save</button><button type="button" className="btn sm" onClick={() => setEditing(null)}>Cancel</button></div></div>
            : m.kind === 'poll' && m.poll ? <Poll m={m} api={api} refresh={refresh} canClose={!!moderator || mine} />
              : <div className="ch-bubble">{m.title && <div className="ch-ann-title">{m.title}</div>}<Body m={m} meWho={meWho} /></div>}
        {!m.deleted && (m.reactions.length > 0) && <div className="ch-reacts">{m.reactions.map((r) => <button key={r.emoji} type="button" className={r.mine ? 'on' : ''} onClick={() => act(() => api.react(m.id, r.emoji))} aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`}>{r.emoji} {r.count}</button>)}</div>}
        {!inThread && !m.deleted && m.replies > 0 && onThread && <button type="button" className="ch-replies" onClick={() => onThread(m)}><MessageSquareReply size={13} /> {m.replies} repl{m.replies === 1 ? 'y' : 'ies'}{m.last_reply_at ? ` · last ${time(m.last_reply_at)}` : ''}</button>}
      </div>
      {!m.deleted && editing === null && <div className="ch-tools" role="toolbar" aria-label="Message actions">
        <span className="ch-pick-wrap">
          <button type="button" className="ch-tool" onClick={() => setPicker(!picker)} aria-label="React" title="React"><SmilePlus size={15} /></button>
          {picker && <span className="ch-picker-pop" onMouseLeave={() => setPicker(false)}>{reactions.map((e) => <button key={e} type="button" onClick={() => { setPicker(false); act(() => api.react(m.id, e)); }} aria-label={`React ${e}`}>{e}</button>)}</span>}
        </span>
        {!inThread && onThread && <button type="button" className="ch-tool" onClick={() => onThread(m)} aria-label="Reply in thread" title="Reply in thread"><MessageSquareReply size={15} /></button>}
        {moderator && !m.parent_id && <button type="button" className="ch-tool" onClick={() => act(() => api.pin(m.id, !m.pinned_at))} aria-label={m.pinned_at ? 'Unpin' : 'Pin'} title={m.pinned_at ? 'Unpin' : 'Pin'}>{m.pinned_at ? <PinOff size={15} /> : <Pin size={15} />}</button>}
        {mine && m.kind !== 'poll' && <button type="button" className="ch-tool" onClick={() => setEditing(m.body)} aria-label="Edit" title="Edit"><Pencil size={15} /></button>}
        {mine && <button type="button" className="ch-tool bad" onClick={() => { if (confirm('Delete this message?')) act(() => api.del(m.id)); }} aria-label="Delete" title="Delete"><Trash2 size={15} /></button>}
        {!mine && onRemove && <button type="button" className="ch-tool bad" onClick={() => onRemove(m)} aria-label="Remove this message" title="Remove this message"><Trash2 size={15} /></button>}
        {!mine && onReport && <button type="button" className="ch-tool bad" onClick={() => onReport(m)} aria-label="Report this message" title="Report this message"><Flag size={15} /></button>}
      </div>}
    </div>
  );
}

/**
 * One conversation, Teams-style: messages with reactions, replies in threads, @mentions, pinned messages, search,
 * and (for the team) announcements and polls.
 */
export function ChatPane({ channel, title, subtitle, meWho, api, rich, moderator, onReport, onRemove, disabled, actions, openThread, readOnly, slowOptions, onSlow }: {
  channel: string; title: string; subtitle?: string; meWho: string; api: ChatApi;
  rich?: boolean; moderator?: boolean; onReport?: (m: ChatMessage) => void; onRemove?: (m: ChatMessage) => void;
  disabled?: string | null; actions?: React.ReactNode; openThread?: string | null; readOnly?: boolean;
  /** The team can set slow mode in delegate groups. */ slowOptions?: number[]; onSlow?: (seconds: number) => Promise<unknown>;
}) {
  const live = channel.startsWith('pending:') ? null : channel;
  // Presence: say "I'm here" (and "typing") every few seconds; hear who else is typing, who is online, and slow mode.
  const [typing, setTyping] = useState<string[]>([]);
  const [slow, setSlow] = useState(0);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [roster, setRoster] = useState<Member[] | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const typedAt = useRef(0);
  const lastPing = useRef(0);
  const doPing = (isTyping: boolean) => {
    if (!live || !api.ping) return;
    lastPing.current = Date.now();
    api.ping(live, isTyping).then((r) => { setTyping(r.typing); setSlow(r.slow); setOnline(new Set(r.online)); }).catch(() => {});
  };
  useEffect(() => {
    setTyping([]); setRoster(null);
    doPing(false);
    const t = setInterval(() => doPing(Date.now() - typedAt.current < 4000), 4000);
    return () => clearInterval(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTyping = () => { const first = Date.now() - typedAt.current > 4000; typedAt.current = Date.now(); if (first && Date.now() - lastPing.current > 1500) doPing(true); };
  useEffect(() => { if (showPeople && live && api.roster) api.roster(live).then(setRoster).catch(() => setRoster([])); }, [showPeople, live, online.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const { msgs, err, refresh } = useMessages(api, live ?? channel, null);
  const [thread, setThread] = useState<string | null>(openThread ?? null);
  const [pins, setPins] = useState<ChatMessage[]>([]);
  const [showPins, setShowPins] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [found, setFound] = useState<ChatMessage[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => { setThread(openThread ?? null); }, [channel, openThread]);
  const pinKey = msgs.filter((m) => m.pinned_at).map((m) => m.id + m.rev).join();
  useEffect(() => { if (live) api.pins(live).then(setPins).catch(() => setPins([])); }, [live, pinKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (atBottom.current) end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  useEffect(() => {
    if (!q || q.trim().length < 2 || !live) { setFound(null); return; }
    const t = setTimeout(() => api.load(live, { q }).then(setFound).catch(() => setFound([])), 300);
    return () => clearTimeout(t);
  }, [q, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const parent = thread ? msgs.find((m) => m.id === thread) : null;
  const shown = found ?? msgs;
  let lastDay = '';
  return (
    <div className={`ch-pane-wrap ${thread ? 'with-thread' : ''}`}>
      <section className="ch-pane">
        <header className="ch-head">
          <div style={{ minWidth: 0 }}><b>{title}</b>{subtitle && <span className="ch-sub">{subtitle}</span>}</div>
          {live && <button type="button" className={`ch-hbtn ${q !== null ? 'on' : ''}`} onClick={() => setQ(q === null ? '' : null)} aria-label="Search this chat" title="Search"><Search size={16} /></button>}
          {slow > 0 && !onSlow && <span className="ch-slow" title="Slow mode"><Timer size={13} /> {slow} s</span>}
          {onSlow && slowOptions && live && (live === 'all' || live.startsWith('c:')) && <label className="ch-slow-pick" title="Slow mode: how long delegates wait between messages"><Timer size={14} /><select value={slow} aria-label="Slow mode" onChange={async (e) => { const v = Number(e.target.value); await onSlow(v); setSlow(v); }}>{slowOptions.map((o) => <option key={o} value={o}>{o ? `Slow ${o} s` : 'Slow mode off'}</option>)}</select></label>}
          {live && api.roster && <button type="button" className={`ch-hbtn ${showPeople ? 'on' : ''}`} onClick={() => setShowPeople(!showPeople)} aria-label="Members" title="Members"><Users size={16} />{online.size > 0 && <small className="ch-on-count">{online.size}</small>}</button>}
          {pins.length > 0 && <button type="button" className={`ch-hbtn ${showPins ? 'on' : ''}`} onClick={() => setShowPins(!showPins)} aria-label={`Pinned messages (${pins.length})`} title="Pinned"><Pin size={16} /><small>{pins.length}</small></button>}
          {actions}
        </header>
        {q !== null && <div className="ch-searchbar"><Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages and names" aria-label="Search messages" /><button type="button" className="ch-act" onClick={() => setQ(null)} aria-label="Close search"><X size={15} /></button></div>}
        {showPins && pins.length > 0 && <div className="ch-pins">{pins.map((p) => <button key={p.id} type="button" onClick={() => { setShowPins(false); setThread(p.id); }}><Pin size={13} /><b>{p.title || p.sender_name}</b><span>{p.body}</span></button>)}</div>}
        <div className="ch-list" onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} aria-live="polite">
          {found && <div className="ch-day">{found.length ? `${found.length} result${found.length === 1 ? '' : 's'}` : 'Nothing found'}</div>}
          {!found && !shown.length && <div className="ch-empty">No messages yet. Start the conversation.</div>}
          {shown.map((m) => {
            const day = dayOf(m.created_at); const showDay = !found && day !== lastDay; lastDay = day;
            return <div key={m.id}>{showDay && <div className="ch-day">{day}</div>}
              <Message m={m} meWho={meWho} api={api} refresh={refresh} onThread={(x) => setThread(x.parent_id ?? x.id)} moderator={moderator} onReport={onReport} onRemove={onRemove} /></div>;
          })}
          <div ref={end} />
        </div>
        {err && <div className="ch-err" role="alert">{err}</div>}
        <div className="ch-typing" aria-live="polite">{typing.length > 0 && <><span className="ch-dots"><i /><i /><i /></span>{typing.length === 1 ? `${typing[0]} is typing…` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing…` : 'Several people are typing…'}</>}</div>
        {readOnly ? null : disabled ? <div className="ch-off">{disabled}</div> : <Composer channel={channel} api={api} rich={rich} onTyping={onTyping} onSent={() => { atBottom.current = true; typedAt.current = 0; refresh(); }} placeholder={slow > 0 ? `Write a message… (slow mode: ${slow} s)` : undefined} />}
      </section>
      {showPeople && !thread && <aside className="ch-people" aria-label="Members">
        <header className="ch-head"><div><b>Members</b><span className="ch-sub">{roster ? `${roster.filter((m) => m.online).length} online · ${roster.length}` : '…'}</span></div><button type="button" className="ch-hbtn" onClick={() => setShowPeople(false)} aria-label="Close members"><X size={16} /></button></header>
        <div className="ch-people-list">
          {!roster ? <div className="ch-empty">Loading…</div> : (['Online', 'Offline'] as const).map((grp) => { const list = roster.filter((m) => (grp === 'Online') === !!m.online); return list.length ? <div key={grp}><div className="ch-group-label">{grp} — {list.length}</div>{list.map((m) => (
            <div key={m.id} className={`ch-person ${m.online ? 'on' : ''}`}><span className={`ch-av sm ${m.kind}`}>{initials(m.name)}<i className="ch-presence" /></span>
              <span className="ch-person-t"><span><b>{m.name}</b>{m.tag && m.tag !== 'Delegate' && <span className={`ch-tag ${m.tag.toLowerCase()}`}>{m.tag}</span>}</span>{m.status && <small>{m.status.emoji} {m.status.text}</small>}</span></div>))}</div> : null; })}
        </div>
      </aside>}
      {thread && live && <Thread key={thread} channel={live} id={thread} parentHint={parent ?? null} meWho={meWho} api={api} moderator={moderator} onReport={onReport} onRemove={onRemove} onClose={() => setThread(null)} disabled={disabled} onChange={refresh} />}
    </div>
  );
}

function Thread({ channel, id, meWho, api, moderator, onReport, onRemove, onClose, disabled, onChange }: {
  channel: string; id: string; parentHint: ChatMessage | null; meWho: string; api: ChatApi; moderator?: boolean;
  onReport?: (m: ChatMessage) => void; onRemove?: (m: ChatMessage) => void; onClose: () => void; disabled?: string | null; onChange: () => void;
}) {
  const { msgs, err, refresh } = useMessages(api, channel, id);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  const root = msgs.find((m) => m.id === id);
  const replies = msgs.filter((m) => m.id !== id);
  const r = () => { refresh(); onChange(); };
  return (
    <aside className="ch-thread" aria-label="Thread">
      <header className="ch-head"><div><b>Thread</b><span className="ch-sub">{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</span></div><button type="button" className="ch-hbtn" onClick={onClose} aria-label="Close thread"><X size={16} /></button></header>
      <div className="ch-list">
        {root && <Message m={root} meWho={meWho} api={api} refresh={r} moderator={moderator} onReport={onReport} onRemove={onRemove} inThread />}
        {replies.length > 0 && <div className="ch-day">Replies</div>}
        {replies.map((m) => <Message key={m.id} m={m} meWho={meWho} api={api} refresh={r} moderator={moderator} onReport={onReport} onRemove={onRemove} inThread />)}
        <div ref={end} />
      </div>
      {err && <div className="ch-err" role="alert">{err}</div>}
      {disabled ? <div className="ch-off">{disabled}</div> : root && !root.deleted && <Composer channel={channel} api={api} parent={id} onSent={r} placeholder="Reply… (@ to mention)" />}
    </aside>
  );
}

const PRESETS = [{ emoji: '✍️', text: 'Drafting the resolution' }, { emoji: '🤝', text: 'Lobbying' }, { emoji: '📚', text: 'Researching' }, { emoji: '🎤', text: 'Speaking next' }, { emoji: '☕', text: 'On a break' }, { emoji: '🔕', text: 'In session, replying later' }];
/** Your custom status (Discord-style), shown in the member list: a preset, your own words, or nothing. */
export function StatusPicker({ base, status, onSaved }: { base: string; status: { emoji: string; text: string } | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(status?.emoji ?? '💬');
  const [text, setText] = useState(status?.text ?? '');
  const save = async (p: { emoji: string; text: string }) => { await api.post(`${base}/status`, p); setOpen(false); onSaved(); };
  return (
    <div className="ch-status">
      <button type="button" className="ch-status-btn" onClick={() => setOpen(!open)} aria-expanded={open}>{status ? <><span>{status.emoji}</span>{status.text}</> : <span className="muted">+ Set a status</span>}</button>
      {open && <div className="ch-status-pop" role="dialog" aria-label="Set your status">
        {PRESETS.map((p) => <button key={p.text} type="button" className="ch-item" onClick={() => save(p)}><span>{p.emoji} {p.text}</span></button>)}
        <div className="row ch-status-own"><input value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} aria-label="Status emoji" style={{ width: 52, textAlign: 'center' }} /><input value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="Your own status" aria-label="Status text" onKeyDown={(e) => e.key === 'Enter' && save({ emoji, text })} /></div>
        <div className="row between"><button type="button" className="ch-link" onClick={() => save({ emoji: '', text: '' })}>Clear status</button><button type="button" className="btn sm primary" onClick={() => save({ emoji, text })}>Save</button></div>
      </div>}
    </div>
  );
}
