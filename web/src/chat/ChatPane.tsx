import { useEffect, useRef, useState } from 'react';
import { Send, Flag, Trash2 } from 'lucide-react';

export interface ChatMessage { id: string; channel: string; sender_kind: 'delegate' | 'staff'; sender_id: string; sender_name: string; body: string; created_at: string; deleted: number | boolean }

/** One conversation: messages that refresh every few seconds, and a box to write in. */
export function ChatPane({ channel, title, subtitle, meId, load, post, onReport, onRemove, disabled, actions }: {
  channel: string; title: string; subtitle?: string; meId?: string;
  load: (channel: string, since: string | null) => Promise<ChatMessage[]>;
  post: (body: string) => Promise<void>;
  onReport?: (m: ChatMessage) => void; onRemove?: (m: ChatMessage) => void;
  disabled?: string | null; actions?: React.ReactNode;
}) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const atBottom = useRef(true);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    setMsgs([]); last.current = null;
    const tick = async (full = false) => {
      try {
        const got = await load(channel, full ? null : last.current);
        if (stop) return;
        if (full) setMsgs(got);
        else if (got.length) setMsgs((m) => [...m.filter((x) => !got.some((g) => g.id === x.id)), ...got]);
        if (got.length) last.current = got[got.length - 1].created_at;
        setErr(null);
      } catch (e: any) { if (!stop) setErr(e.message); }
    };
    tick(true);
    // Removed messages only show on a full refresh, so do one every half minute.
    let n = 0;
    const t = setInterval(() => tick(++n % 10 === 0), 3000);
    return () => { stop = true; clearInterval(t); };
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (atBottom.current) end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      await post(text.trim()); setText(''); atBottom.current = true;
      const got = await load(channel, last.current);
      if (got.length) { setMsgs((m) => [...m.filter((x) => !got.some((g) => g.id === x.id)), ...got]); last.current = got[got.length - 1].created_at; }
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };

  let lastDay = '';
  return (
    <section className="ch-pane">
      <header className="ch-head"><div style={{ minWidth: 0 }}><b>{title}</b>{subtitle && <span className="ch-sub">{subtitle}</span>}</div>{actions}</header>
      <div className="ch-list" ref={list} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }} aria-live="polite">
        {!msgs.length && <div className="ch-empty">No messages yet. Say hello.</div>}
        {msgs.map((m) => {
          const day = new Date(m.created_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
          const showDay = day !== lastDay; lastDay = day;
          const mine = m.sender_id === meId;
          return <div key={m.id}>
            {showDay && <div className="ch-day">{day}</div>}
            <div className={`ch-msg ${mine ? 'mine' : ''} ${m.sender_kind === 'staff' ? 'staff' : ''}`}>
              {!mine && <span className="ch-from">{m.sender_name}</span>}
              <div className="ch-bubble">{m.deleted ? <i className="ch-deleted">Message removed by the conference team</i> : m.body}</div>
              <span className="ch-meta">{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                {!m.deleted && !mine && onReport && <button className="ch-act" onClick={() => onReport(m)} title="Report this message" aria-label="Report this message"><Flag size={12} /></button>}
                {!m.deleted && onRemove && <button className="ch-act" onClick={() => onRemove(m)} title="Remove this message" aria-label="Remove this message"><Trash2 size={12} /></button>}
              </span>
            </div>
          </div>;
        })}
        <div ref={end} />
      </div>
      {err && <div className="ch-err" role="alert">{err}</div>}
      {disabled ? <div className="ch-off">{disabled}</div> : <form className="ch-form" onSubmit={send}>
        <textarea rows={1} value={text} maxLength={1000} placeholder="Write a message…" aria-label="Message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }} />
        <button className="ch-send" disabled={busy || !text.trim()} aria-label="Send"><Send size={18} /></button>
      </form>}
    </section>
  );
}
