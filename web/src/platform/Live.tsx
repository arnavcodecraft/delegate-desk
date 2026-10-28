import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Play, Pause, RotateCcw, SkipForward, Hand, Users, Gavel, Timer, Vote, Plus, X, Check, Copy, LogIn, Radio, Power, Trash2, ShieldAlert, Smartphone, ClipboardList,
} from 'lucide-react';
import { api } from '../api';
import { PlatformShell } from './Shell';
import { Flag } from './art';
import { CommitteeEditor, blankCommittee } from './CommitteeEditor';
import { Amendments, FloorMarking, MarkingBoard, MarkingOff } from './Marking';

type Presence = 'absent' | 'present' | 'present_voting';
const keyFor = (code: string) => `dd-live-key-${code}`;
const seatFor = (code: string) => `dd-live-seat-${code}`;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } }, del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const MODE: Record<string, string> = { idle: 'In session', roll_call: 'Roll call', gsl: 'General speakers list', moderated: 'Moderated caucus', unmoderated: 'Unmoderated caucus', voting: 'Voting procedure' };

/** Poll a session; returns the latest state (the server answers "unchanged" cheaply). */
function useSession(code: string, chairKey?: string | null) {
  const [s, setS] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const ver = useRef(0); const offset = useRef(0);
  const load = async () => {
    try {
      const r = await fetch(`/api/live/${code}?v=${ver.current}`, { headers: chairKey ? { 'x-chair-key': chairKey } : {} });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Session not found');
      if (!d.unchanged) { ver.current = d.version; offset.current = Date.now() - new Date(d.serverTime).getTime(); setS({ ...d, receivedAt: Date.now() }); }
      setError(null);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); const t = setInterval(load, 1500); return () => clearInterval(t); }, [code, chairKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (a: any) => {
    const r = await fetch(`/api/live/${code}/action`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chair-key': chairKey ?? '' }, body: JSON.stringify(a) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    ver.current = d.version; setS({ ...d, receivedAt: Date.now() });
  };
  return { s, error, act, reload: load };
}
/** Seconds left on the session timer, ticking locally between polls. */
function useClock(s: any) {
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
export function SessionView() {
  const { code = '' } = useParams();
  const { s, error } = useSession(code);
  const left = useClock(s);
  const [seat, setSeat] = useState<{ delegateId: string; seatToken: string } | null>(() => { try { return JSON.parse(store.get(seatFor(code)) ?? 'null'); } catch { return null; } });
  const [msg, setMsg] = useState<string | null>(null);
  const me = s?.delegates?.find((d: any) => d.id === seat?.delegateId);
  const post = async (path: string, body: any) => { const r = await fetch(`/api/live/${code}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
  if (error && !s) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">Session not found</h2><p>Check the code with your chair.</p><Link className="pf-btn ghost" to="/session">Back</Link></div></PlatformShell>;
  if (!s) return <PlatformShell><div className="pf-empty">Connecting…</div></PlatformShell>;
  const name = (id: string | null) => s.delegates.find((d: any) => d.id === id)?.name ?? '—';
  const myBallot = s.vote && me ? s.vote.ballots[me.id] : null;
  return (
    <PlatformShell>
      <div className="pf-narrow" style={{ marginTop: 10 }}>
        <div className="pf-card pad pf-center">
          <div className="pf-eyebrow">{s.committee.short || 'Committee'} · {MODE[s.mode]}{s.ended ? ' · ended' : ''}</div>
          <h1 className="pf-h2" style={{ fontSize: 26, marginTop: 6 }}>{s.committee.name}</h1>
          {s.topic && <div className="pf-muted" style={{ marginTop: 4 }}>Agenda: {s.topic}</div>}
          <div className={`lv-timer ${left > 0 && left <= 10 ? 'low' : ''}`} style={{ marginTop: 18 }}>{fmt(left)}</div>
          <div className="pf-muted" style={{ marginTop: 6 }}>{s.speakers.current ? <>Speaking: <b style={{ color: 'var(--pf-ink)' }}>{name(s.speakers.current)}</b></> : s.timer.label || 'No one has the floor'}</div>
          <div className="pf-small pf-muted" style={{ marginTop: 10 }}>{s.quorum.present} of {s.quorum.total} present{s.quorum.debate ? '' : ' · no quorum'}</div>
        </div>

        {!seat || !me ? (
          <div className="pf-card pad" style={{ marginTop: 16 }}>
            <div className="pf-label">Join as your delegation</div>
            <p className="pf-small pf-muted" style={{ marginTop: 0 }}>Pick your country to ask to speak and, when the chair allows it, vote from this phone. One device per delegation.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {s.delegates.map((d: any) => <button key={d.id} className="pf-pill" style={{ justifyContent: 'flex-start' }} onClick={async () => { try { const out = await post('claim', { delegateId: d.id }); const v = { delegateId: d.id, seatToken: out.seatToken }; store.set(seatFor(code), JSON.stringify(v)); setSeat(v); } catch (e: any) { setMsg(e.message); } }}><Flag code={d.code} title={d.name} />{d.name}</button>)}
            </div>
            {msg && <div className="pf-err">{msg}</div>}
          </div>
        ) : (
          <div className="pf-card pad" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Flag code={me.code} round title={me.name} /><b style={{ fontSize: 18 }}>{me.name}</b><span className="pf-tag">{me.presence === 'absent' ? 'Not marked present' : me.presence === 'present_voting' ? 'Present and voting' : 'Present'}</span></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="pf-btn primary" disabled={s.speakers.queue.includes(me.id) || s.speakers.requests.includes(me.id) || s.speakers.current === me.id}
                onClick={async () => { try { await post('request', seat); setMsg('Request sent to the chair'); } catch (e: any) { setMsg(e.message); } }}><Hand className="icon" />{s.speakers.queue.includes(me.id) ? `On the list (#${s.speakers.queue.indexOf(me.id) + 1})` : s.speakers.requests.includes(me.id) ? 'Request sent' : 'Ask to speak'}</button>
            </div>
            {s.vote?.open && s.vote.deviceVoting && (
              <div style={{ marginTop: 16 }}>
                <div className="pf-label">{s.vote.title}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['for', 'against', ...(s.vote.kind === 'substantive' && me.presence !== 'present_voting' ? ['abstain'] : [])] as const).map((b) => (
                    <button key={b} className={`pf-btn ${myBallot === b ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={async () => { try { await post('ballot', { ...seat, ballot: b }); setMsg(`You voted ${b}`); } catch (e: any) { setMsg(e.message); } }}>{b === 'for' ? 'For' : b === 'against' ? 'Against' : 'Abstain'}</button>
                  ))}
                </div>
              </div>
            )}
            {msg && <div className="pf-small pf-muted" style={{ marginTop: 10 }}>{msg}</div>}
          </div>
        )}

        <div className="pf-choices" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div className="pf-card pad"><div className="pf-label"><Users className="icon" style={{ width: 16, height: 16, verticalAlign: -3 }} /> Speakers list</div>
            {!s.speakers.queue.length ? <div className="pf-small pf-muted">Empty</div> : <ol style={{ margin: 0, paddingLeft: 20 }}>{s.speakers.queue.map((id: string) => <li key={id} style={{ padding: '3px 0' }}>{name(id)}</li>)}</ol>}
          </div>
          <div className="pf-card pad"><div className="pf-label"><Vote className="icon" style={{ width: 16, height: 16, verticalAlign: -3 }} /> {s.vote ? s.vote.title : 'Votes'}</div>
            {!s.vote ? <div className="pf-small pf-muted">No vote yet</div> : s.vote.open ? <div className="pf-muted">Voting in progress · {s.tally.for} for, {s.tally.against} against{s.vote.kind === 'substantive' ? `, ${s.tally.abstain} abstaining` : ''}</div>
              : <div className={`lv-result ${s.vote.result.passed ? 'pass' : 'fail'}`}>{s.vote.result.passed ? 'Passed' : s.vote.result.vetoedBy?.length ? `Failed: veto by ${s.vote.result.vetoedBy.join(', ')}` : 'Failed'} · {s.vote.result.for}–{s.vote.result.against}–{s.vote.result.abstain}</div>}
          </div>
        </div>
        <div style={{ marginTop: 16 }}><Amendments s={s} /></div>
      </div>
    </PlatformShell>
  );
}

// ---------- chair console ----------
export function ChairConsole() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const key = useMemo(() => {
    const fromHash = /k=([\w-]+)/.exec(window.location.hash)?.[1];
    if (fromHash) { store.set(keyFor(code), fromHash); history.replaceState(null, '', window.location.pathname); }
    return fromHash ?? store.get(keyFor(code));
  }, [code]);
  const { s, error, act } = useSession(code, key);
  const left = useClock(s);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [motion, setMotion] = useState({ motionType: 'moderated', proposer: '', duration: '10', speakingTime: '45', topic: '' });
  const [voteForm, setVoteForm] = useState({ title: '', kind: 'substantive', rule: 'simple', deviceVoting: false });
  const [addSpeaker, setAddSpeaker] = useState('');
  const [view, setView] = useState<'floor' | 'marking'>(() => (store.get(`dd-live-view-${code}`) as any) || 'floor');
  useEffect(() => store.set(`dd-live-view-${code}`, view), [view, code]);
  const [meta, setMeta] = useState<any>(null);
  useEffect(() => { api.get('/api/live/meta').then(setMeta).catch(() => {}); }, []);
  const run = async (a: any) => { setErr(null); try { await act(a); } catch (e: any) { setErr(e.message); } };
  if (!key) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">This device isn't the chair</h2><p>Open the console from the device that started the session, or from your organiser dashboard.</p><Link className="pf-btn ghost" to={`/session/${code}`}>Open the delegate view</Link></div></PlatformShell>;
  if (error && !s) return <PlatformShell><div className="pf-empty">{error}</div></PlatformShell>;
  if (!s) return <PlatformShell><div className="pf-empty">Connecting…</div></PlatformShell>;
  if (!s.isChair) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">The chair key on this device is out of date</h2><p>Reopen the console from your dashboard.</p></div></PlatformShell>;
  const name = (id: string | null) => s.delegates.find((d: any) => d.id === id)?.name ?? '—';
  const present = s.delegates.filter((d: any) => d.presence !== 'absent');
  const motions = meta?.motions ?? [];
  const mt = motions.find((m: any) => m.key === motion.motionType);
  const joinUrl = `${location.origin}/session/${code}`;
  return (
    <PlatformShell>
      <div className="pf-card pad" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="pf-eyebrow">{MODE[s.mode]}{s.ended ? ' · ended' : ''}</div>
          <div className="pf-h2" style={{ fontSize: 24 }}>{s.committee.short ? `${s.committee.short} · ` : ''}{s.committee.name}</div>
          <input className="pf-input" style={{ minHeight: 38, padding: '6px 12px', fontSize: 14, marginTop: 8, maxWidth: 460 }} placeholder="Agenda topic (press Enter)" defaultValue={s.topic ?? ''} onKeyDown={(e) => { if (e.key === 'Enter') run({ type: 'topic', topic: (e.target as HTMLInputElement).value }); }} aria-label="Agenda topic" />
        </div>
        <div className="pf-center">
          <div className="pf-small pf-muted">Delegates join at {location.host}/session with</div>
          <div className="lv-code">{code}</div>
          <button className="pf-btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>{copied ? <Check className="icon" /> : <Copy className="icon" />}Copy link</button>
        </div>
        <button className="pf-btn danger sm" onClick={async () => { if (confirm('End this session? It becomes read-only.')) { await fetch(`/api/live/${code}/end`, { method: 'POST', headers: { 'x-chair-key': key } }); nav('/session'); } }}><Power className="icon" />End</button>
      </div>
      {err && <div className="pf-note" style={{ marginBottom: 12, background: 'var(--pf-red-soft)', color: 'var(--pf-red)' }}><ShieldAlert className="icon" /><span>{err}</span></div>}
      <div className="mk-switch" role="tablist" aria-label="Console view">
        <button role="tab" aria-selected={view === 'floor'} className={view === 'floor' ? 'on' : ''} onClick={() => setView('floor')}><Gavel className="icon" />Floor</button>
        <button role="tab" aria-selected={view === 'marking'} className={view === 'marking' ? 'on' : ''} onClick={() => setView('marking')}><ClipboardList className="icon" />EB marking{s.marking ? '' : ' (off)'}</button>
      </div>
      {view === 'marking' ? (s.marking ? <MarkingBoard s={s} run={run} code={code} chairKey={key} /> : <MarkingOff run={run} presets={meta?.presets ?? []} />) : <>
      <div className="lv">
        {/* roll call */}
        <div className="pf-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 8px' }}>
            <b style={{ flex: 1 }}>Roll call</b>
            <span className={`pf-tag ${s.quorum.debate ? 'green' : ''}`}>{s.quorum.present}/{s.quorum.total}{s.quorum.debate ? ' · quorum' : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '0 6px 8px' }}>
            <button className="pf-btn ghost sm" style={{ flex: 1 }} onClick={() => run({ type: 'mark_all', presence: 'present' })}>All present</button>
            <button className="pf-btn ghost sm" style={{ flex: 1 }} onClick={() => run({ type: 'mark_all', presence: 'absent' })}>Reset</button>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {s.delegates.map((d: any) => (
              <div className="lv-del" key={d.id}>
                <Flag code={d.code} title={d.name} />
                <span className="name" title={d.person ? `${d.name} – ${d.person}` : d.name}>{d.name}{s.committee.veto.includes(d.id) && <span title="Veto power" style={{ color: 'var(--pf-gold)', marginLeft: 4 }}>★</span>}{s.claimed?.includes(d.id) && <Smartphone style={{ width: 12, height: 12, marginLeft: 4, color: 'var(--pf-ink-3)' }} />}</span>
                <span className="lv-pres">{([['absent', 'A'], ['present', 'P'], ['present_voting', 'PV']] as [Presence, string][]).map(([p, l]) => <button key={p} className={`${d.presence === p ? 'on' : ''} ${p === 'absent' ? 'a' : ''}`} onClick={() => run({ type: 'presence', delegateId: d.id, presence: p })} title={p.replace('_', ' and ')}>{l}</button>)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* floor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="pf-card pad pf-center">
            <div className="pf-muted" style={{ minHeight: 22 }}>{s.speakers.current ? <>Speaking: <b style={{ color: 'var(--pf-ink)' }}>{name(s.speakers.current)}</b></> : s.timer.label || 'Timer'}</div>
            <div className={`lv-timer ${left > 0 && left <= 10 ? 'low' : ''}`}>{fmt(left)}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              {s.timer.startedAt ? <button className="pf-btn ghost sm" onClick={() => run({ type: 'timer', op: 'pause' })}><Pause className="icon" />Pause</button> : <button className="pf-btn ghost sm" onClick={() => run({ type: 'timer', op: 'start' })} disabled={!s.timer.remaining}><Play className="icon" />Resume</button>}
              <button className="pf-btn ghost sm" onClick={() => run({ type: 'timer', op: 'reset' })}><RotateCcw className="icon" />Reset</button>
              <button className="pf-btn primary sm" onClick={() => run({ type: 'speaker_next' })}><SkipForward className="icon" />Next speaker</button>
              <button className="pf-btn ghost sm" onClick={() => { const m = prompt('Timer minutes', '5'); if (m && Number(m) > 0) run({ type: 'timer', op: 'start', seconds: Math.round(Number(m) * 60), label: 'Timer' }); }}><Timer className="icon" />Custom</button>
            </div>
            <div className="pf-small pf-muted" style={{ marginTop: 10 }}>Speaking time <input type="number" min={10} max={600} defaultValue={s.speakers.speakingTime} style={{ width: 70 }} onBlur={(e) => Number(e.target.value) !== s.speakers.speakingTime && run({ type: 'speaking_time', seconds: Number(e.target.value) })} aria-label="Speaking time in seconds" /> seconds</div>
          </div>
          {s.marking?.enabled && <FloorMarking s={s} run={run} />}
          <div className="pf-card pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><b style={{ flex: 1 }}>Speakers list</b>{s.speakers.queue.length > 0 && <button className="pf-btn link" onClick={() => run({ type: 'speaker_clear' })}>Clear</button>}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <select className="pf-input" style={{ minHeight: 40, padding: '6px 10px', fontSize: 14 }} value={addSpeaker} onChange={(e) => setAddSpeaker(e.target.value)} aria-label="Add speaker"><option value="">Add a present delegation…</option>{present.filter((d: any) => !s.speakers.queue.includes(d.id)).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <button className="pf-btn primary sm" disabled={!addSpeaker} onClick={() => { run({ type: 'speaker_add', delegateId: addSpeaker }); setAddSpeaker(''); }}><Plus className="icon" /></button>
            </div>
            {s.speakers.requests.length > 0 && <div className="pf-note" style={{ marginBottom: 10, flexWrap: 'wrap' }}><Hand className="icon" /><span style={{ flex: 1 }}>Asking to speak:</span>{s.speakers.requests.map((id: string) => <span key={id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{name(id)}<button className="pf-btn ghost sm" style={{ padding: '2px 6px', minHeight: 0 }} onClick={() => run({ type: 'request_decide', delegateId: id, accept: true })} aria-label="Accept"><Check className="icon" /></button><button className="pf-btn ghost sm" style={{ padding: '2px 6px', minHeight: 0 }} onClick={() => run({ type: 'request_decide', delegateId: id, accept: false })} aria-label="Decline"><X className="icon" /></button></span>)}</div>}
            {!s.speakers.queue.length ? <div className="pf-small pf-muted">Empty</div> : s.speakers.queue.map((id: string, i: number) => (
              <div className="lv-del" key={id}><b style={{ width: 22 }}>{i + 1}</b><span className="name">{name(id)}</span><button className="pf-btn link" onClick={() => run({ type: 'speaker_remove', delegateId: id })} aria-label="Remove"><X className="icon" /></button></div>
            ))}
          </div>
          <div className="pf-card pad">
            <b>Log</b>
            <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>{!s.log.length ? <div className="pf-small pf-muted">Nothing yet</div> : s.log.map((l: any, i: number) => <div key={i} className="pf-small" style={{ padding: '3px 0' }}><span className="pf-faint">{new Date(l.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span> {l.text}</div>)}</div>
          </div>
        </div>

        {/* motions and voting */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="pf-card pad">
            <b>Motions</b>
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <select className="pf-input" style={{ minHeight: 40, padding: '6px 10px', fontSize: 14 }} value={motion.motionType} onChange={(e) => setMotion({ ...motion, motionType: e.target.value })} aria-label="Motion">{motions.map((m: any) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
              <select className="pf-input" style={{ minHeight: 40, padding: '6px 10px', fontSize: 14 }} value={motion.proposer} onChange={(e) => setMotion({ ...motion, proposer: e.target.value })} aria-label="Proposed by"><option value="">Proposed by…</option>{present.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              {(mt?.needsDuration || mt?.needsSpeakingTime) && <div style={{ display: 'flex', gap: 8 }}>
                {mt?.needsDuration && <label className="pf-small" style={{ flex: 1 }}>Total (min)<input className="pf-input" style={{ minHeight: 38, padding: '4px 10px' }} type="number" min={1} value={motion.duration} onChange={(e) => setMotion({ ...motion, duration: e.target.value })} /></label>}
                {mt?.needsSpeakingTime && <label className="pf-small" style={{ flex: 1 }}>Speaking (s)<input className="pf-input" style={{ minHeight: 38, padding: '4px 10px' }} type="number" min={10} value={motion.speakingTime} onChange={(e) => setMotion({ ...motion, speakingTime: e.target.value })} /></label>}
              </div>}
              {['moderated', 'set_agenda'].includes(motion.motionType) && <input className="pf-input" style={{ minHeight: 38, padding: '4px 10px', fontSize: 14 }} placeholder={motion.motionType === 'set_agenda' ? 'Agenda topic' : 'Caucus topic'} value={motion.topic} onChange={(e) => setMotion({ ...motion, topic: e.target.value })} />}
              <button className="pf-btn primary sm" onClick={() => run({ type: 'motion_add', motionType: motion.motionType, proposer: motion.proposer || null, duration: mt?.needsDuration ? Number(motion.duration) * 60 : null, speakingTime: mt?.needsSpeakingTime ? Number(motion.speakingTime) : null, topic: motion.topic || null })}><Plus className="icon" />Add motion</button>
            </div>
            <div style={{ marginTop: 12 }}>
              {s.motions.filter((m: any) => m.status === 'pending').map((m: any) => (
                <div key={m.id} className="lv-del" style={{ alignItems: 'flex-start' }}>
                  <span className="name" style={{ whiteSpace: 'normal' }}>{motions.find((x: any) => x.key === m.type)?.label ?? m.type}{m.duration ? ` · ${m.duration / 60} min` : ''}{m.speakingTime ? ` · ${m.speakingTime}s` : ''}{m.proposer ? <div className="pf-small pf-muted">{name(m.proposer)}{m.topic ? ` · ${m.topic}` : ''}</div> : null}</span>
                  <button className="pf-btn primary sm" style={{ padding: '4px 10px', minHeight: 0 }} onClick={() => run({ type: 'motion_vote', motionId: m.id })}>Vote</button>
                  <button className="pf-btn link" onClick={() => run({ type: 'motion_withdraw', motionId: m.id })} aria-label="Withdraw"><Trash2 className="icon" /></button>
                </div>
              ))}
              {!s.motions.some((m: any) => m.status === 'pending') && <div className="pf-small pf-muted">No motions on the floor. Vote the most disruptive first.</div>}
            </div>
          </div>

          <div className="pf-card pad">
            <b>Voting</b>
            {!s.vote?.open && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <input className="pf-input" style={{ minHeight: 40, padding: '6px 10px', fontSize: 14 }} placeholder="What is being voted on, e.g. Draft resolution 1.1" value={voteForm.title} onChange={(e) => setVoteForm({ ...voteForm, title: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="pf-input" style={{ minHeight: 40, padding: '6px 10px', fontSize: 14 }} value={voteForm.kind} onChange={(e) => setVoteForm({ ...voteForm, kind: e.target.value })} aria-label="Kind"><option value="substantive">Substantive</option><option value="procedural">Procedural</option></select>
                  <select className="pf-input" style={{ minHeight: 40, padding: '6px 10px', fontSize: 14 }} value={voteForm.rule} onChange={(e) => setVoteForm({ ...voteForm, rule: e.target.value })} aria-label="Majority"><option value="simple">Simple majority</option><option value="two_thirds">Two-thirds</option><option value="security_council">Security Council (9 + veto)</option></select>
                </div>
                <label className="pf-check pf-small"><input type="checkbox" checked={voteForm.deviceVoting} onChange={(e) => setVoteForm({ ...voteForm, deviceVoting: e.target.checked })} />Delegates vote on their phones</label>
                <button className="pf-btn primary sm" disabled={!voteForm.title.trim()} onClick={() => run({ type: 'vote_open', ...voteForm })}><Vote className="icon" />Open vote</button>
              </div>
            )}
            {s.vote && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>{s.vote.title}</div>
                <div className="pf-small pf-muted">{s.vote.kind} · {s.vote.rule === 'two_thirds' ? 'two-thirds' : s.vote.rule === 'security_council' ? 'Security Council' : 'simple majority'}{s.vote.deviceVoting ? ' · on phones' : ''}</div>
                <div style={{ display: 'flex', gap: 10, margin: '10px 0', fontWeight: 750 }}><span style={{ color: '#1f7a45' }}>{s.tally.for} for</span><span style={{ color: 'var(--pf-red)' }}>{s.tally.against} against</span><span className="pf-muted">{s.tally.abstain} abstain</span></div>
                {s.vote.open && <div style={{ maxHeight: 280, overflowY: 'auto' }}>{present.map((d: any) => (
                  <div className="lv-del" key={d.id}><Flag code={d.code} title={d.name} /><span className="name">{d.name}</span>
                    <span className="lv-ballot">{(['for', 'against', ...(s.vote.kind === 'substantive' && d.presence !== 'present_voting' ? ['abstain'] : [])] as string[]).map((b) => <button key={b} className={`${b} ${s.vote.ballots[d.id] === b ? 'on' : ''}`} onClick={() => run({ type: 'ballot', delegateId: d.id, ballot: s.vote.ballots[d.id] === b ? null : b })}>{b === 'for' ? 'Y' : b === 'against' ? 'N' : 'A'}</button>)}</span></div>
                ))}</div>}
                {s.vote.open ? <button className="pf-btn primary sm" style={{ width: '100%', marginTop: 10 }} onClick={() => run({ type: 'vote_close' })}><Gavel className="icon" />Close the vote</button>
                  : <><div className={`lv-result ${s.vote.result.passed ? 'pass' : 'fail'}`}>{s.vote.result.passed ? 'Passes' : s.vote.result.vetoedBy?.length ? `Fails: vetoed by ${s.vote.result.vetoedBy.join(', ')}` : 'Fails'}<div className="pf-small" style={{ fontWeight: 500 }}>Needed {s.vote.result.needed}</div></div>
                    <button className="pf-btn ghost sm" style={{ width: '100%', marginTop: 10 }} onClick={() => run({ type: 'vote_clear' })}>Clear result</button></>}
              </div>
            )}
          </div>
          <Amendments s={s} run={run} />
        </div>
      </div>
      </>}
      <div className="pf-small pf-muted pf-center" style={{ marginTop: 16 }}><Radio className="icon" style={{ width: 13, height: 13, verticalAlign: -2 }} /> Delegates see changes within two seconds. ★ marks veto holders.</div>
    </PlatformShell>
  );
}
