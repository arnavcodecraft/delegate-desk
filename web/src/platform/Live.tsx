import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gavel, Plus, Check, Copy, LogIn, Smartphone, UserPlus, MessageSquare, Send,
} from 'lucide-react';
import { api } from '../api';
import { PlatformShell } from './Shell';
import { CommitteeEditor, blankCommittee } from './CommitteeEditor';

export const keyFor = (code: string) => `dd-live-key-${code}`;
export const seatFor = (code: string) => `dd-live-seat-${code}`;
export const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/** Poll a session; returns the latest state (the server answers "unchanged" cheaply). */
export function useSession(code: string, chairKey?: string | null, seat?: string | null) {
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const ver = useRef(0); const offset = useRef(0);
  const load = async () => {
    try {
      const r = await fetch(`/api/live/${code}?v=${ver.current}`, { headers: { ...(chairKey ? { 'x-chair-key': chairKey } : {}), ...(seat ? { 'x-seat': seat } : {}) } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Session not found');
      if (!d.unchanged) { ver.current = d.version; offset.current = Date.now() - new Date(d.serverTime).getTime(); setS({ ...d, receivedAt: Date.now() }); }
      else if (d.eb || d.online) setS((prev: any) => (prev ? { ...prev, eb: d.eb ?? prev.eb, online: d.online ?? prev.online } : prev));
      setError(null);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); const t = setInterval(load, 1500); return () => clearInterval(t); }, [code, chairKey, seat]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (a: any) => {
    const r = await fetch(`/api/live/${code}/action`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chair-key': chairKey ?? '' }, body: JSON.stringify(a) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    ver.current = d.version; setS({ ...d, receivedAt: Date.now() });
  };
  return { s, error, act, reload: load };
}
/** Seconds left on the session timer, ticking locally between polls. */
export function useClock(s: any) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(t); }, []);
  if (!s) return 0;
  const t = s.timer;
  if (!t.startedAt) return t.remaining;
  return Math.max(0, t.remaining - Math.floor((Date.now() - s.receivedAt) / 1000));
}

// ---------- start or join ----------
export function StartSession() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <PlatformShell>
      <div className="pf-hero"><div className="pf-eyebrow">Live committees</div><h1 className="pf-h1" style={{ marginTop: 10 }}>Run a committee session</h1><p className="pf-sub">Roll call, the speakers list, motions and voting with Security Council vetoes. Free, no account needed. Delegates follow along on their phones with a six-letter code.</p></div>
      <div className="pf-choices" style={{ marginTop: 26 }}>
        <div className="pf-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="glyph" style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--pf-brand-soft)', color: 'var(--pf-brand)', display: 'grid', placeItems: 'center' }}><Gavel className="icon" /></span>
          <div className="pf-h2">Start a session</div>
          <p className="pf-muted" style={{ margin: 0 }}>Name the committee and add its delegations. You get a chair console and a code for delegates.</p>
          <button className="pf-btn primary" onClick={() => setEditing(true)}><Plus className="icon" />New session</button>
          <p className="pf-small pf-muted" style={{ margin: 0 }}>Organisers: start sessions for your committees from your dashboard so the room is filled in with your delegates.</p>
        </div>
        <div className="pf-card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="glyph" style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--pf-gold-soft)', color: 'var(--pf-gold-ink)', display: 'grid', placeItems: 'center' }}><Smartphone className="icon" /></span>
          <div className="pf-h2">Join as a delegate</div>
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 6) nav(`/session/${code.trim().toUpperCase()}`); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="pf-input" style={{ textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 800, textAlign: 'center', fontSize: 22 }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, ''))} placeholder="CODE" aria-label="Session code" />
            <button className="pf-btn ghost" disabled={code.length < 6}><LogIn className="icon" />Join</button>
          </form>
        </div>
      </div>
      {error && <div className="pf-err pf-center">{error}</div>}
      {editing && <CommitteeEditor initial={blankCommittee('mun')} onCancel={() => setEditing(false)} onSave={async (c) => {
        try {
          const out = await api.post<{ code: string; chairKey: string }>('/api/live', { name: c.name, short: c.short, delegates: c.portfolios.map((p) => ({ name: p.name, code: p.code })) });
          store.set(keyFor(out.code), out.chairKey);
          nav(`/session/${out.code}/chair`);
        } catch (e: any) { setError(e.message); throw e; }
      }} />}
    </PlatformShell>
  );
}

// ---------- delegate view ----------
// ---------- chair console ----------
/** The EB room: who on the dais is online, invite a co-chair, and private notes between EB members. */
export function EbRoom({ s, code, chairKey, run }: { s: any; code: string; chairKey: string; run: (a: any) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [invite, setInvite] = useState<{ name: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const notes = s.ebNotes ?? [];
  const unread = notes.length - Number(store.get(`dd-eb-read-${code}`) ?? 0);
  useEffect(() => { if (open) store.set(`dd-eb-read-${code}`, String(notes.length)); }, [open, notes.length, code]);
  const addCoChair = async () => {
    const name = prompt('Co-chair’s name or role (e.g. Vice-Chair Kabir, Rapporteur)');
    if (!name?.trim()) return;
    const r = await fetch(`/api/live/${code}/cochair`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chair-key': chairKey }, body: JSON.stringify({ name }) });
    const d = await r.json(); if (!r.ok) { alert(d.error); return; }
    setInvite({ name: name.trim(), link: `${location.origin}/session/${code}/chair#k=${d.chairKey}` }); setOpen(true);
  };
  return (
    <div className="pf-card eb-room">
      <div className="eb-head">
        <b>Executive Board</b>
        <div className="eb-people">{(s.eb ?? []).map((c: any, i: number) => <span key={i} className={`eb-chip ${c.online ? 'on' : ''}`} title={c.online ? 'Online now' : 'Not on the console right now'}><i />{c.name}{c.name === s.me ? ' (you)' : ''}</span>)}</div>
        <span style={{ flex: 1 }} />
        <button className="pf-btn ghost sm" onClick={addCoChair}><UserPlus className="icon" />Invite co-chair</button>
        <button className="pf-btn ghost sm" onClick={() => setOpen(!open)} aria-expanded={open}><MessageSquare className="icon" />EB notes{!open && unread > 0 ? ` (${unread})` : ''}</button>
      </div>
      {invite && <div className="pf-note" style={{ marginTop: 10 }}><span>Send this link to <b>{invite.name}</b>. It opens this console with their own access, and marks they give show their name. Anyone with the link can chair, so share it privately.<br /><code className="eb-link">{invite.link}</code></span>
        <button className="pf-btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(invite.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>{copied ? <Check className="icon" /> : <Copy className="icon" />}{copied ? 'Copied' : 'Copy'}</button></div>}
      {open && <div className="eb-notes">
        {!notes.length && <div className="pf-small pf-muted">Notes here are only for the EB: agree on marks, flag a delegate, plan the next caucus. Delegates never see them.</div>}
        {notes.slice(-40).map((n: any, i: number) => <div key={i} className={`eb-note ${n.by === s.me ? 'mine' : ''}`}><b>{n.by}</b><span>{n.text}</span><time>{new Date(n.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time></div>)}
        <form className="mk-row" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; await run({ type: 'eb_note', text: note }); setNote(''); }}>
          <input className="pf-input" style={{ flex: 1, minHeight: 38 }} placeholder="Note to the EB…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the EB" maxLength={1000} />
          <button className="pf-btn primary sm" disabled={!note.trim()}><Send className="icon" />Send</button>
        </form>
      </div>}
    </div>
  );
}

