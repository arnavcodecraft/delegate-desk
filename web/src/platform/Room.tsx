import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlarmClockPlus, Check, ChevronDown, ChevronUp, ClipboardList, Copy, CornerUpRight, Crown, DoorOpen, Eye, EyeOff, FileText, Gavel, GripVertical, Hand, KeyRound, Languages,
  ListChecks, MessageCircle, MonitorSmartphone, Pause, Pencil, Play, Plus, Power, Reply, RotateCcw, Scale, ScrollText, Search, Send, Settings, ShieldBan, SkipForward, Star,
  Trophy, Users, Vote, X, Mic, LayoutGrid,
} from 'lucide-react';
import { api } from '../api';
import { PlatformShell } from './Shell';
import { Flag } from './art';
import { Amendments, FloorMarking, MarkingBoard, MarkingOff } from './Marking';
import { EbRoom, fmt, keyFor, store, useClock, useSession } from './Live';
import { LANGS, MODE_KEY, tr, type Key } from './roomText';

type T = (k: Key) => string;
type Run = (a: any) => Promise<void>;
const nameOf = (s: any, id: string | null) => s.delegates.find((d: any) => d.id === id)?.name ?? '—';
const delOf = (s: any, id: string | null) => s.delegates.find((d: any) => d.id === id);

/** A rectangular flag tile (the room's own look: flags as cards, not discs). */
function FlagTile({ code, name, size = 'md' }: { code?: string | null; name?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return <span className={`fl-tile ${size}`}><Flag code={code} title={name} /></span>;
}

/** The speaking timer as a ring that empties as time runs out. */
function TimerRing({ left, total, size = 220, running }: { left: number; total: number; size?: number; running: boolean }) {
  const r = (size - 16) / 2, c = 2 * Math.PI * r, p = total ? Math.max(0, Math.min(1, left / total)) : 0;
  const tone = left === 0 && total ? 'out' : left <= 10 && total ? 'low' : '';
  return (
    <div className={`fl-ring ${tone} ${running ? 'run' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="trk" />
        <circle cx={size / 2} cy={size / 2} r={r} className="val" style={{ strokeDasharray: `${c * p} ${c}` }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="fl-ring-t"><b>{fmt(left)}</b>{total ? <small>of {fmt(total)}</small> : null}</div>
    </div>
  );
}

/** A slide-over panel from the right edge. */
function Drawer({ title, onClose, children, wide, className, actions }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string; actions?: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fl-scrim" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`fl-drawer ${wide ? 'wide' : ''} ${className ?? ''}`}>
        <header className="fl-drawer-h"><h2>{title}</h2>{actions}<button className="rm-x" onClick={onClose} aria-label="Close"><X /></button></header>
        <div className="fl-drawer-b">{children}</div>
      </aside>
    </div>
  );
}
/** Centred dialog, used for short forms. */
function Modal({ title, onClose, children, wide, className }: { title?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string }) {
  return <Drawer title={title ?? ''} onClose={onClose} wide={wide} className={className}>{children}</Drawer>;
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`rm-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></button>;
}

/** Type a delegation's name and pick it. */
function DelegationPicker({ s, onPick, placeholder, filter, autoFocus }: { s: any; onPick: (id: string) => void; placeholder: string; filter?: (d: any) => boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const list = s.delegates.filter((d: any) => (!filter || filter(d)) && (!q || d.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 8);
  const pick = (id: string) => { onPick(id); setQ(''); setOpen(false); setHi(0); };
  return (
    <div className="rm-pick">
      <Search className="rm-pick-ic" />
      <input value={q} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { setHi((h) => Math.min(list.length - 1, h + 1)); e.preventDefault(); } if (e.key === 'ArrowUp') { setHi((h) => Math.max(0, h - 1)); e.preventDefault(); } if (e.key === 'Enter' && list[hi]) { pick(list[hi].id); e.preventDefault(); } }} />
      {open && q && list.length > 0 && <div className="rm-pick-list" role="listbox">{list.map((d: any, i: number) => <button key={d.id} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(d.id); }}><FlagTile code={d.code} name={d.name} size="sm" />{d.name}</button>)}</div>}
    </div>
  );
}

// ================= the chair's room =================
export function ChairRoom() {
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
  const [tab, setTab] = useState<'floor' | 'roll' | 'motions' | 'docs'>('floor');
  const [panel, setPanel] = useState<null | 'settings' | 'chat' | 'scores' | 'dais' | 'raise'>(null);
  const [meta, setMeta] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => { api.get('/api/live/meta').then(setMeta).catch(() => {}); }, []);
  const run: Run = async (a) => { setErr(null); try { await act(a); } catch (e: any) { setErr(e.message); setTimeout(() => setErr(null), 5000); } };
  if (!key) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">This device isn't the chair</h2><p>Open the room from the device that started the session, or from your organiser dashboard.</p><Link className="pf-btn ghost" to={`/session/${code}`}>Open the delegate view</Link></div></PlatformShell>;
  if (error && !s) return <PlatformShell><div className="pf-empty">{error}</div></PlatformShell>;
  if (!s) return <PlatformShell><div className="pf-empty">Connecting…</div></PlatformShell>;
  if (!s.isChair) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">The chair key on this device is out of date</h2><p>Reopen the room from your dashboard.</p></div></PlatformShell>;
  const t = tr(s.settings?.language);
  const headers = { 'x-chair-key': key };
  const pendingMotions = s.motions.filter((m: any) => m.status === 'pending').length;
  const pendingDocs = (s.docs ?? []).filter((d: any) => d.status === 'pending').length;
  const RAIL = [['floor', t('speakers'), Mic, 0], ['roll', t('rollCall'), ListChecks, 0], ['motions', t('motions'), Gavel, pendingMotions], ['docs', t('documents'), FileText, pendingDocs]] as const;
  return (
    <div className="fl" dir={s.settings?.language === 'ar' ? 'rtl' : 'ltr'} data-testid="chair-room">
      <header className="fl-top">
        <Link to="/" className="fl-logo" aria-label="DelegateDesk home">D</Link>
        <CommitteeTitle s={s} t={t} run={run} />
        <span className="fl-mode"><i />{t(MODE_KEY[s.mode] ?? 'inSession')}</span>
        <span style={{ flex: 1 }} />
        <CodeChip code={code} />
        <div className="fl-tools">
          <button className="rm-icon" onClick={() => setPanel('chat')} aria-label={t('chat')} title={t('chat')}><MessageCircle />{unread > 0 && <em>{unread}</em>}</button>
          <button className="rm-icon" onClick={() => setPanel('scores')} aria-label={t('scores')} title={t('scores')}><Trophy /></button>
          <button className="rm-icon" onClick={() => setPanel('dais')} aria-label="Executive Board" title="Executive Board and log"><Users />{(s.pending?.length ?? 0) > 0 && <em>{s.pending.length}</em>}</button>
          <button className="rm-icon" onClick={() => setPanel('settings')} aria-label={t('settings')} title={t('settings')} data-testid="room-settings"><Settings /></button>
          <button className="rm-icon danger" title={t('end')} aria-label={t('end')} onClick={async () => { if (confirm('End this session? It becomes read-only.')) { await fetch(`/api/live/${code}/end`, { method: 'POST', headers }); nav('/session'); } }}><Power /></button>
        </div>
      </header>
      <nav className="fl-rail" role="tablist" aria-label="Room">
        {RAIL.map(([k, l, I, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k === 'roll' && s.mode !== 'roll_call') run({ type: 'roll_call', on: true }); }}><span className="fl-rail-ic"><I />{n > 0 && <em>{n}</em>}</span>{l}</button>)}
      </nav>
      <main className="fl-main">
        {err && <div className="rm-err" role="alert">{err}</div>}
        {s.ended && <div className="rm-err">This session has ended. It is read-only.</div>}
        {s.vote && tab !== 'roll' ? <VotePanel s={s} t={t} run={run} /> : tab === 'floor' ? <Floor s={s} t={t} run={run} left={left} /> : tab === 'roll' ? <RollCall s={s} t={t} run={run} done={() => { run({ type: 'roll_call', on: false }); setTab('floor'); }} />
          : tab === 'motions' ? <MotionsPanel s={s} t={t} run={run} onRaise={() => setPanel('raise')} /> : <DocsPanel s={s} t={t} run={run} />}
      </main>
      <Delegations s={s} t={t} run={run} roll={tab === 'roll'} />
      <ChatWatcher code={code} headers={headers} open={panel === 'chat'} onUnread={setUnread} />
      {panel === 'chat' && <Drawer title={t('chat')} onClose={() => setPanel(null)} className="fl-chat"><RoomChat s={s} t={t} code={code} headers={headers} me="chair" /></Drawer>}
      {panel === 'settings' && <SettingsDrawer s={s} t={t} run={run} code={code} chairKey={key} onClose={() => setPanel(null)} />}
      {panel === 'raise' && <RaiseMotion s={s} t={t} run={run} meta={meta} onClose={() => setPanel(null)} />}
      {panel === 'scores' && <Drawer title={t('scores')} onClose={() => setPanel(null)} wide><Scores s={s} run={run} code={code} chairKey={key} meta={meta} /></Drawer>}
      {panel === 'dais' && <Drawer title="Executive Board" onClose={() => setPanel(null)} wide><Dais s={s} t={t} code={code} chairKey={key} run={run} /></Drawer>}
    </div>
  );
}

function CommitteeTitle({ s, t, run }: { s: any; t: T; run: Run }) {
  const [topic, setTopic] = useState<string | null>(null);
  return (
    <div className="fl-com">
      <b>{s.committee.short || s.committee.name}</b>
      {topic == null ? <button className="fl-topic" onClick={() => setTopic(s.topic ?? '')} title="Change the topic">{s.committee.short ? `${s.committee.name} · ` : ''}{t('topic')}: {s.topic || '—'} <Pencil /></button>
        : <form onSubmit={(e) => { e.preventDefault(); run({ type: 'topic', topic }); setTopic(null); }}><input className="fl-topic-in" autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => { run({ type: 'topic', topic }); setTopic(null); }} aria-label={t('topic')} /></form>}
    </div>
  );
}

function CodeChip({ code }: { code: string }) {
  const [ok, setOk] = useState(false);
  return <button className="rm-code" title={`Delegates join at ${location.host}/session with this code. Click to copy the link.`} onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/session/${code}`); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* blocked */ } }}><span>Join code</span>{code}{ok ? <Check /> : <Copy />}</button>;
}

// ---------- right panel: quorum and the delegation tiles ----------
function Delegations({ s, t, run, roll }: { s: any; t: T; run: Run; roll: boolean }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'present' | 'absent' | 'list'>('all');
  const [adding, setAdding] = useState(false);
  const qq = s.quorum;
  const list = s.delegates.filter((d: any) => (!q || d.name.toLowerCase().includes(q.toLowerCase()))
    && (f === 'all' || (f === 'present' && d.presence !== 'absent') || (f === 'absent' && d.presence === 'absent') || (f === 'list' && (s.speakers.queue.includes(d.id) || s.speakers.current === d.id))));
  const tap = async (d: any) => {
    if (roll) { run({ type: 'presence', delegateId: d.id, presence: d.presence === 'absent' ? 'present' : d.presence === 'present' ? 'present_voting' : 'absent' }); return; }
    if (d.presence === 'absent') await run({ type: 'presence', delegateId: d.id, presence: 'present' });
    if (s.speakers.queue.includes(d.id)) run({ type: 'speaker_remove', delegateId: d.id }); else if (s.speakers.current !== d.id) run({ type: 'speaker_add', delegateId: d.id });
  };
  return (
    <aside className="fl-dels" aria-label="Delegations">
      <div className="fl-quorum">
        <div className="fl-quorum-h"><b>{qq.present}<small>/{qq.total}</small></b><span className={`rm-pill ${qq.debate ? 'ok' : 'bad'}`}>{qq.debate ? t('quorum') : t('noQuorum')}</span></div>
        <div className="fl-qbar"><i style={{ width: `${qq.total ? (qq.present / qq.total) * 100 : 0}%` }} />{qq.need > 0 && <em style={{ left: `${(qq.need / Math.max(1, qq.total)) * 100}%` }} title={`Quorum: ${qq.need}`} />}</div>
        <div className="fl-qnums"><span><b>{qq.twoThirds}</b> {t('twoThirds')}</span><span><b>{qq.majority}</b> {t('majority')}</span><span><b>{qq.presentVoting}</b> PV</span></div>
      </div>
      <div className="fl-dels-tools">
        <div className="fl-search"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findDelegation')} aria-label={t('findDelegation')} /></div>
        <button className="rm-icon ghost" onClick={() => setAdding(!adding)} aria-label={t('addSeat')} title={t('addSeat')}><Plus /></button>
      </div>
      {adding && <form className="fl-addform" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); await run({ type: 'add_delegate', name: String(fd.get('n')), code: String(fd.get('c') || '') || null }); setAdding(false); }}>
        <input name="n" placeholder="Delegation name" autoFocus required aria-label="Delegation name" /><input name="c" placeholder="Flag code" maxLength={6} aria-label="Two-letter country code" style={{ width: 90 }} />
        <button className="rm-btn sm primary">Add</button>
      </form>}
      <div className="fl-filters">{([['all', 'All'], ['present', t('present')], ['absent', t('absent')], ['list', t('onList')]] as const).map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
      <p className="fl-hint">{roll ? 'Tap a delegation to cycle absent → present → present and voting.' : 'Tap to add to or take off the speakers list.'}</p>
      <div className="fl-grid">
        {list.map((d: any) => {
          const pos = s.speakers.queue.indexOf(d.id); const cur = s.speakers.current === d.id;
          return (
            <button key={d.id} className={`fl-del ${d.presence} ${cur ? 'cur' : ''} ${pos >= 0 ? 'queued' : ''}`} onClick={() => tap(d)} title={d.name}>
              <FlagTile code={d.code} name={d.name} />
              <span className="fl-del-n">{d.name}</span>
              <i className={`fl-pres ${d.presence}`} title={d.presence === 'absent' ? t('absent') : d.presence === 'present' ? t('present') : t('presentVoting')}>{d.presence === 'present_voting' ? 'PV' : d.presence === 'present' ? 'P' : ''}</i>
              {(pos >= 0 || cur) && <em className="fl-q">{cur ? <Mic /> : pos + 1}</em>}
              {s.committee.veto.includes(d.id) && <Crown className="fl-veto" aria-label="Veto power" />}
              {(s.online ?? []).includes(d.id) && <span className="fl-online" title="Online on their device" />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ---------- the floor: who is speaking, the timer ring and what comes next ----------
function Floor({ s, t, run, left }: { s: any; t: T; run: Run; left: number }) {
  const [pop, setPop] = useState<null | 'yield' | 'rtr'>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [custom, setCustom] = useState(String(s.speakers.speakingTime));
  useEffect(() => setCustom(String(s.speakers.speakingTime)), [s.speakers.speakingTime]);
  const cur = delOf(s, s.speakers.current);
  const running = !!s.timer.startedAt;
  const caucus = !cur && s.timer.duration > 0;
  const listTitle = ['moderated', 'tour', 'unmoderated', 'consultation'].includes(s.mode) ? t(MODE_KEY[s.mode]) : t('gsl');
  return (
    <div className="fl-floor">
      {s.speakers.requests.length > 0 && <div className="rm-requests"><Hand /><b>{t('askingToSpeak')}</b>{s.speakers.requests.map((id: string) => <span key={id}><FlagTile code={delOf(s, id)?.code} size="sm" />{nameOf(s, id)}<button onClick={() => run({ type: 'request_decide', delegateId: id, accept: true })} aria-label="Accept"><Check /></button><button onClick={() => run({ type: 'request_decide', delegateId: id, accept: false })} aria-label="Decline"><X /></button></span>)}</div>}
      <section className="fl-card fl-now-card">
        <div className="fl-now-l">
          {(cur || caucus) ? <TimerRing left={left} total={s.timer.duration} running={running} /> : <div className="fl-ring idle"><Mic /></div>}
          <div className="fl-play">
            {running ? <button className="rm-btn primary big" onClick={() => run({ type: 'timer', op: 'pause' })}><Pause />{t('pause')}</button>
              : <button className="rm-btn primary big" disabled={!s.timer.remaining && !s.speakers.queue.length} onClick={() => (s.timer.remaining ? run({ type: 'timer', op: 'start' }) : run({ type: 'speaker_next', start: true }))}><Play />{t('start')}</button>}
            <button className="rm-btn big" onClick={() => run({ type: 'timer', op: 'reset' })} disabled={!s.timer.duration} aria-label={t('reset')} title={t('reset')}><RotateCcw /></button>
          </div>
        </div>
        <div className="fl-now-r">
          <div className="rm-k">{listTitle}</div>
          {cur ? <div className="rm-now"><FlagTile code={cur.code} name={cur.name} size="xl" /><div><h1>{cur.name}</h1><div className="rm-now-sub">{s.timer.label && s.timer.label !== cur.name ? s.timer.label : running ? t('speaking') : t('readyToSpeak')}</div></div></div>
            : caucus ? <div className="rm-now"><div><h1 className="caucus">{s.timer.label}</h1><div className="rm-now-sub">{running ? t('inSession') : t('pause')}</div></div></div>
              : <div className="fl-empty-now">{s.speakers.queue.length ? <>{t('next')}: <b>{nameOf(s, s.speakers.queue[0])}</b>. Press {t('next')} or {t('start')}.</> : t('emptyList')}</div>}
          <div className="fl-acts">
            <button className="rm-btn" onClick={() => run({ type: 'speaker_next', start: false })} disabled={!s.speakers.queue.length && !cur}><SkipForward />{t('next')}</button>
            <button className="rm-btn" onClick={() => run({ type: 'timer', op: 'add', seconds: 15 })} disabled={!s.timer.duration} title={`${t('extend')} (+15s)`}><AlarmClockPlus />+15s</button>
            <div className="rm-pop-wrap"><button className="rm-btn" onClick={() => setPop(pop === 'yield' ? null : 'yield')} disabled={!cur}><CornerUpRight />{t('yield')}<ChevronDown className="sm" /></button>
              {pop === 'yield' && cur && <div className="rm-pop" onMouseLeave={() => setPop(null)}>
                <button onClick={() => { run({ type: 'yield', to: 'chair' }); setPop(null); }}>{t('yieldChair')}</button>
                <button onClick={() => { run({ type: 'yield', to: 'questions' }); setPop(null); }}>{t('yieldQuestions')}</button>
                <div className="rm-pop-k">{t('yieldDelegate')}</div>
                <DelegationPicker s={s} placeholder={t('findDelegation')} filter={(d) => d.id !== cur.id && d.presence !== 'absent'} onPick={(id) => { run({ type: 'yield', to: id }); setPop(null); }} autoFocus />
              </div>}</div>
            <div className="rm-pop-wrap"><button className="rm-btn" onClick={() => setPop(pop === 'rtr' ? null : 'rtr')}><Reply />{t('rtr')}<ChevronDown className="sm" /></button>
              {pop === 'rtr' && <div className="rm-pop" onMouseLeave={() => setPop(null)}><div className="rm-pop-k">{t('rtr')} · 30s</div>
                <DelegationPicker s={s} placeholder={t('findDelegation')} filter={(d) => d.presence !== 'absent'} onPick={(id) => { run({ type: 'rtr', delegateId: id, seconds: 30 }); setPop(null); }} autoFocus /></div>}</div>
          </div>
          {cur && s.settings?.rateSpeeches && <div className="rm-stars" aria-label="Rate this speech">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => run({ type: 'rate', delegateId: cur.id, stars: n })} aria-label={`${n} stars`}><Star /></button>)}</div>}
        </div>
      </section>
      {cur && s.marking?.enabled && <FloorMarking s={s} run={run} />}
      <section className="fl-card">
        <div className="fl-card-h"><h3>Up next <small>{s.speakers.queue.length}</small></h3><span style={{ flex: 1 }} />
          <span className="fl-time"><span className="rm-k">{t('time')}</span>{[45, 60, 90].map((n) => <button key={n} className={s.speakers.speakingTime === n ? 'on' : ''} onClick={() => run({ type: 'speaking_time', seconds: n })}>{n}s</button>)}
            <input type="number" min={10} max={600} value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => Number(custom) !== s.speakers.speakingTime && Number(custom) >= 10 && run({ type: 'speaking_time', seconds: Number(custom) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Speaking time in seconds" /></span>
        </div>
        <DelegationPicker s={s} placeholder={t('addToList')} filter={(d) => !s.speakers.queue.includes(d.id) && s.speakers.current !== d.id}
          onPick={async (id) => { if (delOf(s, id)?.presence === 'absent') await run({ type: 'presence', delegateId: id, presence: 'present' }); run({ type: 'speaker_add', delegateId: id }); }} />
        {!s.speakers.queue.length ? <p className="fl-hint" style={{ marginTop: 12 }}>{t('emptyList')}</p> : <ol className="fl-queue">
          {s.speakers.queue.map((id: string, i: number) => { const d = delOf(s, id); return (
            <li key={id} className={drag === id ? 'drag' : ''} draggable onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => drag && e.preventDefault()} onDrop={() => { if (drag && drag !== id) run({ type: 'speaker_move', delegateId: drag, to: i }); setDrag(null); }}>
              <GripVertical className="grip" /><span className="n">{i + 1}</span><FlagTile code={d?.code} name={d?.name} size="sm" /><b>{d?.name}</b>
              <button className="rm-icon ghost sm" onClick={() => run({ type: 'speaker_remove', delegateId: id })} aria-label={`Remove ${d?.name}`}><X /></button>
            </li>); })}
        </ol>}
        {s.speakers.queue.length > 1 && <button className="rm-link" onClick={() => confirm('Clear the speakers list?') && run({ type: 'speaker_clear' })}>Clear the list</button>}
      </section>
    </div>
  );
}

function RollCall({ s, t, run, done }: { s: any; t: T; run: Run; done: () => void }) {
  const [q, setQ] = useState('');
  const list = s.delegates.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rm-panel">
      <div className="rm-panel-head">
        <h2>{t('rollCall')}</h2>
        <span className={`rm-pill ${s.quorum.debate ? 'ok' : 'bad'}`}>{s.quorum.present}/{s.quorum.total} · {s.quorum.debate ? t('quorum') : t('noQuorum')}</span>
        <span style={{ flex: 1 }} />
        <div className="rm-search inline"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findDelegation')} aria-label={t('findDelegation')} /></div>
        <button className="rm-btn" onClick={() => run({ type: 'mark_all', presence: 'present' })}>{t('allPresent')}</button>
        <button className="rm-btn" onClick={() => run({ type: 'mark_all', presence: 'absent' })}>{t('reset')}</button>
        <button className="rm-btn primary" onClick={done}><Check />{t('finishRollCall')}</button>
      </div>
      {s.settings?.selfStatus && <p className="rm-hint"><MonitorSmartphone /> Delegations who joined on their phones can mark themselves now.</p>}
      <div className="rm-roll">
        {list.map((d: any) => (
          <div key={d.id} className={`rm-roll-row ${d.presence}`}>
            <FlagTile size="sm" code={d.code} name={d.name} /><span>{d.name}</span>
            <div className="rm-seg">{([['absent', 'A'], ['present', 'P'], ['present_voting', 'PV']] as const).map(([p, l]) => <button key={p} className={d.presence === p ? `on ${p}` : ''} onClick={() => run({ type: 'presence', delegateId: d.id, presence: p })} title={p === 'absent' ? t('absent') : p === 'present' ? t('present') : t('presentVoting')}>{l}</button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- motions ----------
function MotionsPanel({ s, t, run, onRaise }: { s: any; t: T; run: Run; onRaise: () => void }) {
  const order: string[] = s.motionOrder ?? [];
  const label = (k: string) => s.motionLabels?.[k] ?? k;
  const pending = s.motions.filter((m: any) => m.status === 'pending').sort((a: any, b: any) => (order.indexOf(a.type) - order.indexOf(b.type)) || ((b.duration ?? 0) - (a.duration ?? 0)));
  const done = s.motions.filter((m: any) => m.status !== 'pending').slice(-6).reverse();
  const [vf, setVf] = useState({ title: '', kind: 'substantive' });
  return (
    <div className="rm-panel">
      <div className="rm-panel-head"><h2>{t('motions')}</h2><span style={{ flex: 1 }} /><button className="rm-btn primary big" onClick={onRaise}><Plus />{t('raiseMotion')}</button></div>
      {!pending.length ? <div className="rm-empty small">{t('noMotions')}</div> : <>
        <p className="rm-hint">Most disruptive first. Vote them in this order; once one passes, the rest fall.</p>
        <div className="rm-motions">{pending.map((m: any, i: number) => (
          <div key={m.id} className="rm-motion">
            <span className="rm-motion-n">{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{label(m.type)}{m.topic ? `: ${m.topic}` : ''}</b>
              <small>{[m.proposer && nameOf(s, m.proposer), m.duration && `${Math.round(m.duration / 60)} min`, m.speakingTime && `${m.speakingTime}s each`, m.duration && m.speakingTime && `${Math.floor(m.duration / m.speakingTime)} ${t('canSpeak')}`].filter(Boolean).join(' · ')}</small>
            </div>
            <button className="rm-btn primary" onClick={() => run({ type: 'motion_vote', motionId: m.id })}><Vote />{t('vote')}</button>
            <button className="rm-btn ghost" onClick={() => run({ type: 'motion_withdraw', motionId: m.id })}>{t('withdraw')}</button>
          </div>))}</div>
      </>}
      <div className="rm-cards2">
        <div className="rm-card">
          <h3><Vote /> {t('openVote')}</h3>
          <form className="rm-form" onSubmit={(e) => { e.preventDefault(); run({ type: 'vote_open', title: vf.title, kind: vf.kind }); setVf({ ...vf, title: '' }); }}>
            <input value={vf.title} onChange={(e) => setVf({ ...vf, title: e.target.value })} placeholder="What is being voted on" aria-label="What is being voted on" required />
            <div className="rm-seg wide">{(['substantive', 'procedural'] as const).map((k) => <button type="button" key={k} className={vf.kind === k ? 'on' : ''} onClick={() => setVf({ ...vf, kind: k })}>{k === 'substantive' ? 'Substantive' : 'Procedural'}</button>)}</div>
            <button className="rm-btn primary">{t('openVote')}</button>
          </form>
        </div>
        <div className="rm-card">
          <h3><ScrollText /> Recent</h3>
          {!done.length ? <p className="rm-hint">Passed and failed motions show here.</p> : done.map((m: any) => <div key={m.id} className="rm-recent"><span className={`rm-pill ${m.status === 'passed' ? 'ok' : m.status === 'failed' ? 'bad' : ''}`}>{m.status}</span>{label(m.type)}{m.proposer ? ` · ${nameOf(s, m.proposer)}` : ''}</div>)}
        </div>
      </div>
    </div>
  );
}


function VotePanel({ s, t, run }: { s: any; t: T; run: Run }) {
  const v = s.vote; const c = s.settings ?? {};
  const present = s.delegates.filter((d: any) => d.presence !== 'absent');
  const total = Math.max(1, s.tally.for + s.tally.against + s.tally.abstain);
  const voted = Object.keys(v.ballots).filter((id) => v.ballots[id] !== 'pass').length;
  const options = (d: any) => ['for', 'against', ...(v.kind === 'substantive' && c.abstentions !== false && d.presence !== 'present_voting' ? ['abstain'] : []), ...(v.kind === 'substantive' && c.allowPass ? ['pass'] : [])];
  return (
    <div className="rm-panel rm-vote">
      <div className="rm-panel-head">
        <div><div className="rm-k">{v.kind === 'substantive' ? 'Substantive vote' : 'Procedural vote'} · {v.rule === 'two_thirds' ? 'two-thirds' : v.rule === 'consensus' ? 'consensus' : v.rule === 'security_council' ? 'Security Council' : 'simple majority'}{v.deviceVoting ? ' · on devices' : ''}</div><h2>{v.title}</h2></div>
        <span style={{ flex: 1 }} />
        {v.open ? <button className="rm-btn primary big" onClick={() => run({ type: 'vote_close' })}><Gavel />{t('closeVote')}</button> : <button className="rm-btn big" onClick={() => run({ type: 'vote_clear' })}>{t('clearResult')}</button>}
      </div>
      <div className="rm-tally">
        <div className="for"><b>{s.tally.for}</b>{t('for')}<i style={{ width: `${(s.tally.for / total) * 100}%` }} /></div>
        <div className="against"><b>{s.tally.against}</b>{t('against')}<i style={{ width: `${(s.tally.against / total) * 100}%` }} /></div>
        {v.kind === 'substantive' && <div className="abstain"><b>{s.tally.abstain}</b>{t('abstain')}<i style={{ width: `${(s.tally.abstain / total) * 100}%` }} /></div>}
        <div className="count">{voted}/{present.length}</div>
      </div>
      {!v.open && v.result && <div className={`rm-result ${v.result.passed ? 'ok' : 'bad'}`}>{v.result.passed ? t('passes') : v.result.vetoedBy?.length ? `${t('fails')}: veto (${v.result.vetoedBy.join(', ')})` : t('fails')}<small>{t('needed')}: {v.result.needed}</small></div>}
      {v.open && <div className="rm-ballots">{present.map((d: any) => { const b = v.ballots[d.id]; const rights = (v.rights ?? []).includes(d.id); return (
        <div key={d.id} className={`rm-ballot ${b ?? ''}`}>
          <FlagTile size="sm" code={d.code} name={d.name} /><span>{d.name}{s.committee.veto.includes(d.id) && v.kind === 'substantive' && <Crown className="veto" />}{rights && <small> · {t('withRights')}</small>}</span>
          <div className="rm-seg">{options(d).map((o) => <button key={o} className={b === o ? `on ${o}` : ''} onClick={() => run({ type: 'ballot', delegateId: d.id, ballot: b === o ? null : o, rights: o === b ? false : rights })} title={t(o as Key)}>{o === 'for' ? 'Y' : o === 'against' ? 'N' : o === 'abstain' ? 'A' : 'P'}</button>)}
            {c.withRights && v.kind === 'substantive' && (b === 'for' || b === 'against') && <button className={rights ? 'on rights' : ''} onClick={() => run({ type: 'ballot', delegateId: d.id, ballot: b, rights: !rights })} title={t('withRights')}>R</button>}</div>
        </div>); })}</div>}
    </div>
  );
}

// ---------- documents ----------
function DocsPanel({ s, t, run, seat }: { s: any; t: T; run?: Run; seat?: { delegateId: string; seatToken: string; post: (p: string, b: any) => Promise<any> } }) {
  const c = s.settings?.docs ?? { wp: { one: 'Working Paper', many: 'Working Papers' }, dr: { one: 'Draft Resolution', many: 'Draft Resolutions' }, sponsorsLabel: 'Sponsors' };
  const [kind, setKind] = useState<'wp' | 'dr'>('wp');
  const [form, setForm] = useState(false);
  const docs = (s.docs ?? []).filter((d: any) => d.kind === kind);
  const status = (st: string) => ({ pending: t('pending'), open: t('open'), passed: t('passed'), failed: t('failed'), rejected: t('rejected') } as any)[st] ?? st;
  return (
    <div className="rm-panel">
      <div className="rm-panel-head">
        <h2>{t('documents')}</h2>
        <div className="rm-seg wide big">{(['wp', 'dr'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{c[k].many} <em>{(s.docs ?? []).filter((d: any) => d.kind === k).length}</em></button>)}</div>
        <span style={{ flex: 1 }} />
        <button className="rm-btn primary big" onClick={() => setForm(true)}><Plus />{t('submitNew')} {c[kind].one}</button>
      </div>
      {!docs.length ? <div className="rm-empty small">{t('noDocs')}</div> : <div className="rm-docs">{docs.map((d: any) => (
        <div key={d.id} className={`rm-doc ${d.status}`}>
          <div className="rm-doc-top"><span className="rm-doc-tag">{kind === 'wp' ? 'WP' : 'DR'}</span><b>{d.title}</b><span className={`rm-pill ${d.status === 'passed' || d.status === 'open' ? 'ok' : d.status === 'failed' || d.status === 'rejected' ? 'bad' : 'warn'}`}>{status(d.status)}</span></div>
          {d.sponsors.length > 0 && <div className="rm-doc-who"><span>{c.sponsorsLabel}</span>{d.sponsors.map((id: string) => <span key={id} className="rm-mini"><FlagTile size="sm" code={delOf(s, id)?.code} />{nameOf(s, id)}</span>)}</div>}
          {d.signatories.length > 0 && <div className="rm-doc-who"><span>{t('signatories')}</span>{d.signatories.map((id: string) => <span key={id} className="rm-mini"><FlagTile size="sm" code={delOf(s, id)?.code} />{nameOf(s, id)}</span>)}</div>}
          {d.body && <details className="rm-doc-body"><summary>{t('text')}</summary><pre>{d.body}</pre></details>}
          {(d.link || run) && <div className="rm-doc-act">
            {d.link && <a className="rm-btn ghost" href={d.link} target="_blank" rel="noopener noreferrer"><FileText />Open</a>}
            {run && d.status === 'pending' && <><button className="rm-btn primary" onClick={() => run({ type: 'doc_status', docId: d.id, status: 'open' })}><Check />{t('approve')}</button><button className="rm-btn ghost" onClick={() => run({ type: 'doc_status', docId: d.id, status: 'rejected' })}>{t('reject')}</button></>}
            {run && d.kind === 'dr' && d.status === 'open' && <button className="rm-btn primary" onClick={() => run({ type: 'doc_vote', docId: d.id })}><Vote />{t('vote')}</button>}
          </div>}
        </div>))}</div>}
      {kind === 'dr' && <div style={{ marginTop: 18 }}><Amendments s={s} run={run} /></div>}
      {form && <DocForm s={s} t={t} kind={kind} name={c[kind].one} sponsorsLabel={c.sponsorsLabel} onClose={() => setForm(false)} seat={seat}
        onSubmit={async (d) => { if (seat) await seat.post('doc', { delegateId: seat.delegateId, seatToken: seat.seatToken, kind, ...d }); else await run!({ type: 'doc_add', kind, ...d }); setForm(false); }} />}
    </div>
  );
}

function DocForm({ s, t, kind, name, sponsorsLabel, onClose, onSubmit, seat }: { s: any; t: T; kind: string; name: string; sponsorsLabel: string; onClose: () => void; onSubmit: (d: any) => Promise<void>; seat?: { delegateId: string } }) {
  const [f, setF] = useState({ title: '', link: '', body: '', sponsors: [] as string[], signatories: [] as string[] });
  const [err, setErr] = useState<string | null>(null);
  const chips = (k: 'sponsors' | 'signatories', label: string) => (
    <label className="rm-field"><span>{label}</span>
      <div className="rm-chips">{f[k].map((id) => <span key={id} className="rm-mini"><FlagTile size="sm" code={delOf(s, id)?.code} />{nameOf(s, id)}<button type="button" onClick={() => setF({ ...f, [k]: f[k].filter((x) => x !== id) })} aria-label="Remove"><X /></button></span>)}</div>
      <DelegationPicker s={s} placeholder="Add a delegation…" filter={(d) => !f.sponsors.includes(d.id) && !f.signatories.includes(d.id) && d.id !== seat?.delegateId} onPick={(id) => setF({ ...f, [k]: [...f[k], id] })} />
    </label>);
  return (
    <Modal title={`${t('submitNew')} ${name}`} onClose={onClose} wide>
      <form className="rm-form" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await onSubmit({ title: f.title, link: f.link || null, body: f.body || null, sponsors: f.sponsors, signatories: f.signatories }); } catch (x: any) { setErr(x.message); } }}>
        <label className="rm-field"><span>{t('title')} <i>*</i></span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus placeholder={kind === 'dr' ? 'e.g. DR 1.1' : 'e.g. WP 1'} /></label>
        {chips('sponsors', seat ? `${sponsorsLabel} (you are included)` : sponsorsLabel)}
        {chips('signatories', t('signatories'))}
        <label className="rm-field"><span>{t('link')}</span><input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://docs.google.com/…" /></label>
        <label className="rm-field"><span>{t('text')}</span><textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Paste the clauses here (optional)" /></label>
        {err && <div className="rm-err inline">{err}</div>}
        <div className="rm-row end"><button type="button" className="rm-btn" onClick={onClose}>{t('cancel')}</button><button className="rm-btn primary">{t('submit')}</button></div>
      </form>
    </Modal>
  );
}

// ---------- chat ----------
/** Polls for new messages while the chat is closed, to show the unread count. */
function ChatWatcher({ code, headers, open, onUnread }: { code: string; headers: Record<string, string>; open: boolean; onUnread: (n: number) => void }) {
  const last = useRef<number>(Number(store.get(`dd-room-chat-read-${code}`) ?? 0));
  useEffect(() => {
    if (open) { onUnread(0); return; }
    let stop = false;
    const tick = async () => { try { const r = await fetch(`/api/live/${code}/chat?after=${last.current}`, { headers }); const d = await r.json(); if (!stop && r.ok) onUnread(d.messages.filter((m: any) => m.sender !== d.me).length); } catch { /* offline */ } };
    tick(); const id = setInterval(tick, 4000); return () => { stop = true; clearInterval(id); };
  }, [open, code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) last.current = Number(store.get(`dd-room-chat-read-${code}`) ?? 0); }, [open, code]);
  return null;
}

export function RoomChat({ s, t, code, headers, me }: { s: any; t: T; code: string; headers: Record<string, string>; me: string }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [to, setTo] = useState('all');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(true);   // opens on the Everyone conversation
  const last = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const load = async () => {
    try {
      const r = await fetch(`/api/live/${code}/chat?after=${last.current}`, { headers }); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.messages.length) { last.current = d.messages[d.messages.length - 1].id; store.set(`dd-room-chat-read-${code}`, String(last.current)); setMsgs((m) => [...m, ...d.messages]); }
      setErr(null);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); const id = setInterval(load, 2500); return () => clearInterval(id); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const thread = msgs.filter((m) => (to === 'all' ? m.recipient === 'all' : (m.sender === to && m.recipient === me) || (m.sender === me && m.recipient === to)));
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread.length, to]);
  const lastWith = (id: string) => [...msgs].reverse().find((m) => (m.sender === id && m.recipient === me) || (m.sender === me && m.recipient === id));
  const who = (id: string) => (id === 'chair' ? t('theChair') : id === 'all' ? t('everyone') : nameOf(s, id));
  const people = [...(me !== 'chair' ? [{ id: 'chair', name: t('theChair'), code: null }] : []), ...s.delegates.filter((d: any) => d.id !== me)].filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  people.sort((a: any, b: any) => (lastWith(b.id)?.id ?? 0) - (lastWith(a.id)?.id ?? 0));
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim()) return;
    try { const r = await fetch(`/api/live/${code}/chat`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ to, text }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setText(''); load(); } catch (x: any) { setErr(x.message); }
  };
  const Avatar = ({ id }: { id: string }) => id === 'all' ? <span className="rm-av all"><MessageCircle /></span> : id === 'chair' ? <span className="rm-av chair"><Gavel /></span> : <span className="rm-av"><FlagTile size="sm" code={delOf(s, id)?.code} name={nameOf(s, id)} /></span>;
  return (
    <div className={`rm-chat ${mobileThread ? 'thread' : ''}`}>
      <div className="rm-chat-list">
        <h2>{t('chat')}</h2>
        <div className="rm-search inline"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findDelegation')} aria-label="Search" /></div>
        <button className={`rm-chat-item ${to === 'all' ? 'on' : ''}`} onClick={() => { setTo('all'); setMobileThread(true); }}><Avatar id="all" /><span><b>{t('everyone')}</b><small>{t('everyoneSub')}</small></span></button>
        <div className="rm-chat-k">Direct messages</div>
        {people.map((d: any) => { const lm = lastWith(d.id); return (
          <button key={d.id} className={`rm-chat-item ${to === d.id ? 'on' : ''}`} onClick={() => { setTo(d.id); setMobileThread(true); }}><Avatar id={d.id} /><span><b>{d.name}</b><small>{lm ? lm.text.slice(0, 40) : '—'}</small></span></button>); })}
      </div>
      <div className="rm-chat-main">
        <div className="rm-chat-head"><button className="rm-icon ghost rm-back" onClick={() => setMobileThread(false)} aria-label="Back">‹</button><Avatar id={to} /><span><b>{who(to)}</b><small>{to === 'all' ? t('everyoneSub') : to === 'chair' ? 'Only the chair sees this' : 'Private: only the two of you'}</small></span></div>
        <div className="rm-chat-body">
          {!thread.length ? <div className="rm-chat-empty"><Avatar id={to} /><b>{who(to)}</b><span>{t('sayHello')}</span></div>
            : thread.map((m) => <div key={m.id} className={`rm-msg ${m.sender === me ? 'mine' : ''}`}>{m.sender !== me && to === 'all' && <b>{who(m.sender)}</b>}<span>{m.text}</span><time>{new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>)}
          <div ref={end} />
        </div>
        {err && <div className="rm-err inline">{err}</div>}
        <form className="rm-chat-send" onSubmit={send}><input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('message')} aria-label={t('message')} maxLength={1000} /><button className="rm-send" disabled={!text.trim()} aria-label={t('send')}><Send /></button></form>
      </div>
    </div>
  );
}

// ---------- settings ----------

// ---------- raising a motion: a drawer with the motion types as a ranked list ----------
function RaiseMotion({ s, t, run, meta, onClose }: { s: any; t: T; run: Run; meta: any; onClose: () => void }) {
  const order: string[] = s.motionOrder ?? [];
  const off = new Set((s.settings?.motions ?? []).filter((m: any) => !m.on).map((m: any) => m.key));
  const types = order.filter((k) => !off.has(k) && (k !== 'custom' || s.settings?.customMotion));
  const [type, setType] = useState(types.includes('moderated') ? 'moderated' : types[0]);
  const [f, setF] = useState({ topic: '', proposer: '', min: 10, sec: 0, each: 60 });
  const mt = meta?.motions?.find((m: any) => m.key === type) ?? {};
  const label = (k: string) => s.motionLabels?.[k] ?? k;
  const total = f.min * 60 + f.sec;
  const needTopic = type === 'moderated' || type === 'custom' || type === 'set_agenda';
  const ok = (!needTopic || f.topic.trim()) && (!mt.needsDuration || total > 0);
  const submit = async () => {
    await run({ type: 'motion_add', motionType: type, proposer: f.proposer || null, topic: f.topic || null, duration: mt.needsDuration || (type === 'custom' && total) ? total : null, speakingTime: mt.needsSpeakingTime ? f.each : null });
    onClose();
  };
  return (
    <Drawer title={t('raiseMotion')} onClose={onClose} wide className="rm-raise">
      <div className="mo-grid">
        <div className="mo-types" role="radiogroup" aria-label="Motion">
          <div className="rm-k">Most disruptive first</div>
          {types.map((k, i) => <button key={k} role="radio" aria-checked={type === k} className={`mo-type ${type === k ? 'on' : ''} ${['adjourn', 'suspend', 'table', 'close_debate'].includes(k) ? 'hard' : ''}`} onClick={() => setType(k)}>
            <span className="mo-rank" aria-hidden>{Array.from({ length: 4 }, (_, j) => <i key={j} className={j < Math.max(1, 4 - Math.floor((i / Math.max(1, types.length - 1)) * 4)) ? 'on' : ''} />)}</span>{label(k)}{type === k && <Check className="tick" />}</button>)}
        </div>
        <div className="mo-form">
          <h3>{label(type)}</h3>
          {needTopic && <label className="rm-field"><span>{type === 'custom' ? 'Motion' : t('topic')} <i>*</i></span><input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder={type === 'custom' ? 'e.g. Motion to introduce a guest speaker' : 'e.g. Humanitarian response in conflict zones'} autoFocus /></label>}
          <label className="rm-field"><span>{t('proposedBy')}</span>
            {f.proposer ? <div className="rm-picked"><FlagTile code={delOf(s, f.proposer)?.code} size="sm" />{nameOf(s, f.proposer)}<button onClick={() => setF({ ...f, proposer: '' })} aria-label="Change"><X /></button></div>
              : <DelegationPicker s={s} placeholder="Type country name…" filter={(d) => d.presence !== 'absent'} onPick={(id) => setF({ ...f, proposer: id })} />}
          </label>
          {(mt.needsDuration || type === 'custom') && <div className="rm-field"><span>{t('totalTime')}{type === 'custom' ? ' (optional)' : ''}</span>
            <div className="mo-step"><button type="button" onClick={() => setF({ ...f, min: Math.max(0, f.min - 1) })} aria-label="One minute less">−</button><b>{f.min}<small>min</small></b><button type="button" onClick={() => setF({ ...f, min: Math.min(120, f.min + 1) })} aria-label="One minute more">+</button>
              <span className="mo-presets">{[5, 10, 15, 20].map((m) => <button type="button" key={m} className={f.min === m && !f.sec ? 'on' : ''} onClick={() => setF({ ...f, min: m, sec: 0 })}>{m}m</button>)}</span></div></div>}
          {mt.needsSpeakingTime && <div className="rm-field"><span>{t('perDelegate')}</span>
            <div className="mo-step"><button type="button" onClick={() => setF({ ...f, each: Math.max(10, f.each - 15) })} aria-label="Less">−</button><b>{f.each}<small>sec</small></b><button type="button" onClick={() => setF({ ...f, each: Math.min(600, f.each + 15) })} aria-label="More">+</button>
              <span className="mo-presets">{[30, 45, 60, 90].map((n) => <button type="button" key={n} className={f.each === n ? 'on' : ''} onClick={() => setF({ ...f, each: n })}>{n}s</button>)}</span></div>
            {mt.needsDuration && f.each > 0 && <p className="fl-hint"><b>{Math.floor(total / f.each)}</b> {t('canSpeak')}</p>}</div>}
          <div className="rm-raise-foot"><button className="rm-btn primary block big" disabled={!ok} onClick={submit}><Plus />Add to the floor</button></div>
        </div>
      </div>
    </Drawer>
  );
}

// ---------- settings: a plain settings list in a drawer ----------
function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="st-row"><div><b>{title}</b>{hint && <small>{hint}</small>}</div><div className="st-row-c">{children}</div></div>;
}
function Choice<V extends string>({ value, options, onChange }: { value: V; options: readonly (readonly [V, string, string?])[]; onChange: (v: V) => void }) {
  return <div className="st-choice">{options.map(([k, l, h]) => <button key={k} className={`rm-choice ${value === k ? 'on' : ''}`} onClick={() => onChange(k)} role="radio" aria-checked={value === k}><i className="dot" /><span><b>{l}</b>{h && <small>{h}</small>}</span></button>)}</div>;
}

function SettingsDrawer({ s, t, run, code, chairKey, onClose }: { s: any; t: T; run: Run; code: string; chairKey: string; onClose: () => void }) {
  const [tab, setTab] = useState<'access' | 'motions' | 'voting' | 'points' | 'people'>('access');
  const [saved, setSaved] = useState(false);
  const c = s.settings;
  const set = async (patch: any) => { await run({ type: 'settings', patch }); setSaved(true); setTimeout(() => setSaved(false), 1200); };
  return (
    <Drawer title={t('settings')} onClose={onClose} wide className="rm-settings" actions={<span className={`st-saved ${saved ? 'on' : ''}`}><Check />Saved</span>}>
      <div className="rm-set-nav" role="tablist">{([['access', 'Access'], ['motions', t('motions')], ['voting', 'Voting'], ['points', 'Points'], ['people', 'People']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'access' && <AccessTab s={s} c={c} set={set} run={run} code={code} chairKey={chairKey} />}
      {tab === 'motions' && <MotionsTab s={s} c={c} set={set} />}
      {tab === 'voting' && <VotingTab s={s} c={c} set={set} run={run} />}
      {tab === 'points' && <PointsTab c={c} set={set} />}
      {tab === 'people' && <PeopleTab s={s} code={code} chairKey={chairKey} />}
      <div className="st-group"><h4><Languages />Room language</h4><Row title="Language" hint="What the room and the delegates' screens are shown in."><div className="rm-seg">{LANGS.map((l) => <button key={l.key} className={c.language === l.key ? 'on' : ''} onClick={() => set({ language: l.key })}>{l.label}</button>)}</div></Row></div>
    </Drawer>
  );
}

function AccessTab({ s, c, set, run, code, chairKey }: { s: any; c: any; set: (p: any) => void; run: Run; code: string; chairKey: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState('');
  const copy = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1400); } catch { /* blocked */ } };
  const chairLink = `${location.origin}/session/${code}/chair#k=${chairKey}`;
  const pending = s.pending ?? [];
  return <>
    <div className="st-group"><h4><KeyRound />Joining</h4>
      <Row title="Session code" hint={`Delegates open ${location.host}/session and type it.`}><span className="st-code">{code}</span><button className="rm-btn sm" onClick={() => copy('code', `${location.origin}/session/${code}`)}>{copied === 'code' ? <Check /> : <Copy />}Copy link</button></Row>
      <Row title="Chair link" hint="Opens this room with chair rights. Share it only with your EB."><span className={`st-secret ${show ? '' : 'blur'}`}>{show ? chairLink.replace(/^https?:\/\//, '') : '••••••••••••'}</span><button className="rm-icon ghost sm" onClick={() => setShow(!show)} aria-label={show ? 'Hide' : 'Show'}>{show ? <EyeOff /> : <Eye />}</button><button className="rm-icon ghost sm" onClick={() => copy('chair', chairLink)} aria-label="Copy chair link">{copied === 'chair' ? <Check /> : <Copy />}</button></Row>
    </div>
    <div className="st-group"><h4><MonitorSmartphone />What delegates can do</h4>
      <Row title="Chat" hint="Message everyone, the chair, and each other."><Toggle on={!!c.chat} onChange={(v) => set({ chat: v })} label="Chat" /></Row>
      <Row title="Change own status" hint="Mark themselves present during roll call."><Toggle on={!!c.selfStatus} onChange={(v) => set({ selfStatus: v })} label="Change own status" /></Row>
      <Row title="Join without approval" hint="Off: new devices wait until you let them in."><Toggle on={!!c.openJoin} onChange={(v) => set({ openJoin: v })} label="Join without approval" /></Row>
      {pending.length > 0 && <div className="rm-waiting"><b><DoorOpen /> {pending.length} waiting to join</b>{pending.map((id: string) => <div key={id} className="rm-waitrow"><FlagTile code={delOf(s, id)?.code} size="sm" />{nameOf(s, id)}<span style={{ flex: 1 }} /><button className="rm-btn primary sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: true })}>Let in</button><button className="rm-btn sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: false })}>Deny</button></div>)}</div>}
    </div>
    <div className="st-group"><h4><Users />The dais</h4>
      <div className="st-dais">{(s.eb ?? []).map((m: any, i: number) => <span key={i} className="st-person"><i className={m.online ? 'on' : ''} />{m.name}{m.name === s.me ? ' (you)' : ''}<small>{i === 0 ? 'Moderator' : 'Co-chair'}</small></span>)}</div>
      <p className="fl-hint">Invite a co-chair from the Executive Board panel.</p>
    </div>
  </>;
}

function MotionsTab({ s, c, set }: { s: any; c: any; set: (p: any) => void }) {
  const ms = c.motions as { key: string; on: boolean; label?: string }[];
  const label = (k: string) => s.motionLabels?.[k] ?? k;
  const move = (i: number, d: number) => { const n = [...ms]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); set({ motions: n }); };
  const rename = (k: string) => { const v = prompt('Name for this motion', label(k)); if (v != null) set({ motions: ms.map((m) => (m.key === k ? { ...m, label: v.trim() } : m)) }); };
  const docs = c.docs;
  const editDoc = (k: 'wp' | 'dr', f: 'one' | 'many') => { const v = prompt('Name', docs[k][f]); if (v?.trim()) set({ docs: { [k]: { [f]: v.trim() } } }); };
  return <>
    <div className="st-group"><h4><Gavel />Motion order</h4>
      <p className="fl-hint">Top is the most disruptive and is voted first. Switch off what your committee doesn't use.</p>
      <ol className="st-order">{ms.map((m, i) => <li key={m.key} className={m.on ? '' : 'off'}>
        <span className="n">{i + 1}</span><button className="st-name" onClick={() => rename(m.key)}>{label(m.key)}<Pencil /></button>
        <span className="st-updown"><button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp /></button><button disabled={i === ms.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown /></button></span>
        <Toggle on={m.on} onChange={(v) => set({ motions: ms.map((x) => (x.key === m.key ? { ...x, on: v } : x)) })} label={label(m.key)} />
      </li>)}</ol>
      <Row title="Custom motions" hint="Delegates may propose any other motion."><Toggle on={c.customMotion} onChange={(v) => set({ customMotion: v })} label="Custom motions" /></Row>
      <Row title={`${label('suspend')}, ${label('close_debate')}, ${label('adjourn')}`} hint="Always available, and voted before the others."><span className="rm-pill">Always on</span></Row>
    </div>
    <div className="st-group"><h4><FileText />Documents</h4>
      {(['wp', 'dr'] as const).map((k) => <Row key={k} title={`${docs[k].one} / ${docs[k].many}`} hint="Tap a name to change it.">
        <button className="rm-btn sm" onClick={() => editDoc(k, 'one')}>{docs[k].one}</button><button className="rm-btn sm" onClick={() => editDoc(k, 'many')}>{docs[k].many}</button>
        <span className="rm-step"><button onClick={() => set({ docs: { [k]: { max: docs[k].max == null ? 3 : docs[k].max > 1 ? docs[k].max - 1 : null } } })} aria-label="Lower the limit">−</button><b title="Maximum">{docs[k].max ?? '∞'}</b><button onClick={() => set({ docs: { [k]: { max: docs[k].max == null ? null : Math.min(99, docs[k].max + 1) } } })} aria-label="Raise the limit">+</button></span>
      </Row>)}
      <Row title="Approve papers first" hint="Delegates' papers show to the room once you approve them."><Toggle on={docs.approve} onChange={(v) => set({ docs: { approve: v } })} label="Approve papers first" /></Row>
      <Row title="Sponsors label"><input className="st-input" defaultValue={docs.sponsorsLabel} onBlur={(e) => e.target.value !== docs.sponsorsLabel && set({ docs: { sponsorsLabel: e.target.value } })} placeholder="Sponsors" aria-label="Sponsors label" /></Row>
    </div>
  </>;
}

function VotingTab({ s, c, set, run }: { s: any; c: any; set: (p: any) => void; run: Run }) {
  return <>
    <div className="st-group"><h4><Scale />Pass threshold</h4>
      <Choice value={c.threshold} onChange={(v) => set({ threshold: v })} options={[['simple', 'Simple majority (1/2 + 1)', 'More votes for than against'], ['two_thirds', '2/3 Supermajority', 'At least two thirds of votes cast'], ['consensus', 'Consensus', 'Every delegation voting votes for']] as const} />
      <Row title="Allow abstentions" hint="Present and voting delegations still can't abstain."><Toggle on={c.abstentions} onChange={(v) => set({ abstentions: v })} label="Allow abstentions" /></Row>
      <Row title="Votes with rights" hint="Vote for or against and explain the vote afterwards."><Toggle on={c.withRights} onChange={(v) => set({ withRights: v })} label="Votes with rights" /></Row>
      <Row title="Pass" hint="In a roll-call vote, pass and be asked again at the end."><Toggle on={c.allowPass} onChange={(v) => set({ allowPass: v })} label="Allow passing" /></Row>
    </div>
    <div className="st-group"><h4><Vote />How delegations vote</h4>
      <Choice value={c.voteMethod} onChange={(v) => set({ voteMethod: v })} options={[['roll_call', 'Roll call', 'You record each vote'], ['devices', 'Devices', 'Delegations vote on their phones']] as const} />
    </div>
    <div className="st-group"><h4><ShieldBan />Veto</h4>
      <Choice value={c.veto} onChange={(v) => set({ veto: v })} options={[['none', 'No veto'], ['p5', 'P5 veto', 'The five permanent members, when present'], ['unanimous', 'Unanimous decision'], ['custom', 'Custom veto members', 'Choose below']] as const} />
      {c.veto === 'custom' && <div className="rm-vetolist">{s.delegates.map((d: any) => { const on = s.committee.veto.includes(d.id); return <button key={d.id} className={on ? 'on' : ''} onClick={() => run({ type: 'set_veto', delegateId: d.id, on: !on })}><FlagTile code={d.code} size="sm" />{d.name}<Crown /></button>; })}</div>}
    </div>
    <div className="st-group"><h4><Users />Quorum</h4>
      <Choice value={c.quorum} onChange={(v) => set({ quorum: v })} options={[['third', 'One third', `${Math.ceil(s.quorum.total / 3)} of ${s.quorum.total}`], ['half', 'Half + 1', `${Math.floor(s.quorum.total / 2) + 1} of ${s.quorum.total}`], ['two_thirds', 'Two thirds', `${Math.ceil((s.quorum.total * 2) / 3)} of ${s.quorum.total}`], ['none', 'No quorum', 'Debate any time']] as const} />
    </div>
  </>;
}

function PointsTab({ c, set }: { c: any; set: (p: any) => void }) {
  const labels: Record<string, string> = { attendance: 'Attendance (P/PV)', gsl: 'GSL speech', caucus: 'Caucus speech', minute: 'Speaking time (per minute)', raised: 'Motion raised', passed: 'Motion passed', rtr: 'Right of reply', wp: 'Working paper', dr: 'Draft resolution', drPassed: 'Draft resolution passed' };
  const blend = c.rateSpeeches ? c.blend : 100;
  return <>
    <div className="st-group"><h4><Trophy />Points per action</h4>
      <table className="st-points"><tbody>{Object.entries(labels).map(([k, l]) => { const p = c.points[k]; return (
        <tr key={k} className={p.on ? '' : 'off'}><td><Toggle on={p.on} onChange={(v) => set({ points: { [k]: { on: v } } })} label={l} /></td><td>{l}</td>
          <td><span className="rm-step"><button onClick={() => set({ points: { [k]: { pts: Math.max(0, p.pts - 1) } } })} aria-label="Less">−</button><b>{p.pts}</b><button onClick={() => set({ points: { [k]: { pts: Math.min(100, p.pts + 1) } } })} aria-label="More">+</button></span></td></tr>); })}</tbody></table>
    </div>
    <div className="st-group"><h4><Star />Speech quality</h4>
      <Row title="Rate speeches" hint="Rate each speech 1–5 on the floor; the ranking blends points with ratings."><Toggle on={c.rateSpeeches} onChange={(v) => set({ rateSpeeches: v })} label="Rate speeches" /></Row>
      <Row title="Blend" hint={`${blend}% points · ${100 - blend}% ratings`}><input className="st-range" type="range" min={0} max={100} step={5} value={blend} disabled={!c.rateSpeeches} onChange={(e) => set({ blend: Number(e.target.value) })} aria-label="Points versus ratings" /></Row>
    </div>
  </>;
}

function PeopleTab({ s, code, chairKey }: { s: any; code: string; chairKey: string }) {
  const [q, setQ] = useState('');
  const online = new Set(s.online ?? []);
  const claimed = new Set(s.claimed ?? []);
  const list = s.delegates.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const release = async (id: string) => { if (!confirm('Reset this delegation’s device? Someone else can then join as them.')) return; await fetch(`/api/live/${code}/release`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chair-key': chairKey }, body: JSON.stringify({ delegateId: id }) }); };
  return <div className="st-group"><h4><MonitorSmartphone />Delegations <small>{online.size} of {s.delegates.length} online</small></h4>
    <div className="fl-search" style={{ marginBottom: 10 }}><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a delegation" aria-label="Find a delegation" /></div>
    <div className="st-people">{list.map((d: any) => <div key={d.id} className="st-pp"><FlagTile code={d.code} size="sm" /><span>{d.name}</span><i className={`st-dot ${online.has(d.id) ? 'on' : claimed.has(d.id) ? 'away' : ''}`} title={online.has(d.id) ? 'Online' : claimed.has(d.id) ? 'Joined, not open now' : 'Not joined'} />{claimed.has(d.id) && <button className="rm-link" onClick={() => release(d.id)}>reset</button>}</div>)}</div>
  </div>;
}

// ---------- scores: points ranking and EB marking ----------
function Scores({ s, run, code, chairKey, meta }: { s: any; run: Run; code: string; chairKey: string; meta: any }) {
  const [view, setView] = useState<'ranking' | 'marking'>('ranking');
  const rows = s.ranking ?? [];
  return <div className="rm-scores">
    <div className="rm-seg wide" style={{ marginBottom: 14 }}><button className={view === 'ranking' ? 'on' : ''} onClick={() => setView('ranking')}><Trophy />Points ranking</button><button className={view === 'marking' ? 'on' : ''} onClick={() => setView('marking')}><ClipboardList />EB marking{s.marking ? '' : ' (off)'}</button></div>
    {view === 'ranking' ? <>
      <p className="fl-hint">From what happens in the room, weighted in Settings → Points{s.settings?.rateSpeeches ? ', blended with your speech ratings' : ''}. Delegates never see this.</p>
      <div className="rm-rank">
        <div className="rm-rank-row head"><span>#</span><span>Delegation</span><span>Speeches</span><span>Time</span><span>Points</span>{s.settings?.rateSpeeches && <span>Quality</span>}<span>Score</span></div>
        {rows.map((r: any, i: number) => <div key={r.id} className={`rm-rank-row ${i < 3 && r.points ? `top${i + 1}` : ''}`}><span>{i + 1}</span><span className="rm-rank-name"><FlagTile code={r.code} size="sm" />{r.name}</span><span>{r.speeches}</span><span>{fmt(r.seconds)}</span><span>{r.points}</span>{s.settings?.rateSpeeches && <span>{r.quality ?? '—'}</span>}<span><b>{r.score}</b></span></div>)}
      </div>
    </> : s.marking ? <MarkingBoard s={s} run={run} code={code} chairKey={chairKey} /> : <MarkingOff run={run} presets={meta?.presets ?? []} />}
  </div>;
}

function Dais({ s, t, code, chairKey, run }: { s: any; t: T; code: string; chairKey: string; run: Run }) {
  const pending = s.pending ?? [];
  return <div className="rm-daisdrawer">
    {pending.length > 0 && <div className="rm-waiting"><b><DoorOpen /> {pending.length} waiting to join</b>{pending.map((id: string) => <div key={id} className="rm-waitrow"><FlagTile code={delOf(s, id)?.code} size="sm" />{nameOf(s, id)}<span style={{ flex: 1 }} /><button className="rm-btn primary sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: true })}>Let in</button><button className="rm-btn sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: false })}>Deny</button></div>)}</div>}
    <EbRoom s={s} code={code} chairKey={chairKey} run={run} />
    <div className="fl-card" style={{ marginTop: 14 }}><div className="fl-card-h"><h3><ScrollText /> Log</h3></div><div className="rm-log">{!s.log.length ? <p className="fl-hint">Nothing yet</p> : s.log.map((l: any, i: number) => <div key={i}><time>{new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>{l.text}</div>)}</div></div>
    <p className="fl-hint" style={{ marginTop: 10 }}>{t('inSession')} · {s.quorum.present}/{s.quorum.total} {t('present').toLowerCase()}</p>
  </div>;
}

// ================= the delegate's view =================
export function DelegateRoom() {
  const { code = '' } = useParams();
  const [seat, setSeat] = useState<{ delegateId: string; seatToken: string } | null>(() => { try { return JSON.parse(store.get(`dd-live-seat-${code}`) ?? 'null'); } catch { return null; } });
  const seatHeader = seat ? `${seat.delegateId}.${seat.seatToken}` : null;
  const { s, error } = useSession(code, null, seatHeader);
  const left = useClock(s);
  const [msg, setMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | 'chat' | 'docs'>(null);
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState('');
  const post = async (path: string, body: any) => { const r = await fetch(`/api/live/${code}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };
  const me = s?.delegates?.find((d: any) => d.id === seat?.delegateId);
  useEffect(() => { if (s && seat && !me) { store.del(`dd-live-seat-${code}`); setSeat(null); } }, [s?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error && !s) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">Session not found</h2><p>Check the code with your chair.</p><Link className="pf-btn ghost" to="/session">Back</Link></div></PlatformShell>;
  if (!s) return <PlatformShell><div className="pf-empty">Connecting…</div></PlatformShell>;
  const t = tr(s.settings?.language);
  const cur = delOf(s, s.speakers.current);
  const waiting = !!s.waiting;
  const v = s.vote;
  const myBallot = v && me ? v.ballots[me.id] : null;
  const myRights = v && me ? (v.rights ?? []).includes(me.id) : false;
  const canChat = !!me && !waiting && s.settings?.chat;
  const ballotOpts = me && v ? ['for', 'against', ...(v.kind === 'substantive' && s.settings?.abstentions !== false && me.presence !== 'present_voting' ? ['abstain'] : []), ...(v.kind === 'substantive' && s.settings?.allowPass ? ['pass'] : [])] : [];
  return (
    <div className="rd" dir={s.settings?.language === 'ar' ? 'rtl' : 'ltr'} data-testid="delegate-room">
      <header className="rd-top">
        <Link to="/" className="fl-logo" aria-label="DelegateDesk home">D</Link>
        <div className="rd-com"><b>{s.committee.short || s.committee.name}</b><small>{t(MODE_KEY[s.mode] ?? 'inSession')}{s.ended ? ' · ended' : ''}</small></div>
        <span style={{ flex: 1 }} />
        {me && !waiting && <button className="rm-icon" onClick={() => setPanel('docs')} aria-label={t('documents')} title={t('documents')}><FileText /></button>}
        {canChat && <button className="rm-icon" onClick={() => setPanel('chat')} aria-label={t('chat')} title={t('chat')}><MessageCircle />{unread > 0 && <em>{unread}</em>}</button>}
      </header>
      <div className="rd-body">
        {s.topic && <div className="rd-topic">{t('topic')}: <b>{s.topic}</b></div>}
        <div className="rd-stage fl-card">
          {(cur || s.timer.duration > 0) ? <TimerRing left={left} total={s.timer.duration} size={170} running={!!s.timer.startedAt} /> : <div className="fl-ring idle sm"><Mic /></div>}
          <div className="rd-who">{cur ? <><FlagTile code={cur.code} name={cur.name} size="lg" /><h1>{cur.name}</h1><div className="rm-now-sub">{s.timer.startedAt ? t('speaking') : t('readyToSpeak')}</div></>
            : <div className="rm-now-sub big">{s.timer.duration ? s.timer.label : t('noFloor')}</div>}
            <div className="rd-quorum">{s.quorum.present}/{s.quorum.total} {t('present').toLowerCase()} · {s.quorum.debate ? t('quorum') : t('noQuorum')}</div></div>
        </div>
        {!seat || !me ? (
          <div className="fl-card rd-card">
            <h2>{t('join')}</h2>
            <p className="fl-hint">Pick your delegation to ask to speak, mark yourself at roll call, message the room and vote from this device. One device per delegation.</p>
            <div className="fl-search"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findDelegation')} aria-label={t('findDelegation')} /></div>
            <div className="rd-join">{s.delegates.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase())).map((d: any) => <button key={d.id} onClick={async () => { try { const out = await post('claim', { delegateId: d.id }); const x = { delegateId: d.id, seatToken: out.seatToken }; store.set(`dd-live-seat-${code}`, JSON.stringify(x)); setSeat(x); } catch (e: any) { say(e.message); } }}><FlagTile code={d.code} name={d.name} size="sm" />{d.name}</button>)}</div>
          </div>
        ) : waiting ? (
          <div className="fl-card rd-card center"><DoorOpen className="rd-big-ic" /><h2>{t('waiting')}</h2><p className="fl-hint">You joined as <b>{me.name}</b>. This page updates by itself.</p></div>
        ) : (
          <div className="fl-card rd-card">
            <div className="rd-me"><FlagTile code={me.code} name={me.name} size="md" /><span><b>{me.name}</b><small>{me.presence === 'absent' ? t('absent') : me.presence === 'present_voting' ? t('presentVoting') : t('present')}</small></span></div>
            {s.mode === 'roll_call' && s.settings?.selfStatus && <div className="rd-roll"><span>{t('markPresent')}:</span>{(['present', 'present_voting'] as const).map((p) => <button key={p} className={`rm-btn ${me.presence === p ? 'primary' : ''}`} onClick={() => post('presence', { ...seat, presence: p }).catch((e) => say(e.message))}>{p === 'present' ? t('present') : t('presentVoting')}</button>)}</div>}
            <button className="rm-btn primary block big" disabled={s.speakers.queue.includes(me.id) || s.speakers.requests.includes(me.id) || s.speakers.current === me.id}
              onClick={() => post('request', seat).then(() => say(t('requestSent'))).catch((e) => say(e.message))}><Hand />{s.speakers.queue.includes(me.id) ? `${t('onList')} · #${s.speakers.queue.indexOf(me.id) + 1}` : s.speakers.requests.includes(me.id) ? t('requestSent') : t('askToSpeak')}</button>
            {v?.open && v.deviceVoting && <div className="rd-vote">
              <div className="rm-k">{t('vote')}</div><b>{v.title}</b>
              <div className="rd-ballot">{ballotOpts.map((b) => <button key={b} className={`rm-btn ${myBallot === b ? `on ${b}` : ''}`} onClick={() => post('ballot', { ...seat, ballot: b, rights: myRights && (b === 'for' || b === 'against') }).then(() => say(`${t(b as Key)} ✓`)).catch((e) => say(e.message))}>{t(b as Key)}</button>)}</div>
              {s.settings?.withRights && v.kind === 'substantive' && (myBallot === 'for' || myBallot === 'against') && <label className="rd-rights"><input type="checkbox" checked={myRights} onChange={(e) => post('ballot', { ...seat, ballot: myBallot, rights: e.target.checked }).catch((x) => say(x.message))} />{t('withRights')}</label>}
            </div>}
          </div>
        )}
        {msg && <div className="rd-toast" role="status">{msg}</div>}
        <div className="rd-grid">
          <div className="fl-card rd-card"><h3><LayoutGrid />{t('gsl')}</h3>
            {!s.speakers.queue.length ? <p className="fl-hint">—</p> : <ol className="fl-queue compact">{s.speakers.queue.map((id: string, i: number) => <li key={id} className={id === me?.id ? 'me' : ''}><span className="n">{i + 1}</span><FlagTile code={delOf(s, id)?.code} size="sm" /><b>{nameOf(s, id)}</b></li>)}</ol>}
          </div>
          <div className="fl-card rd-card"><h3><Vote />{v ? v.title : t('vote')}</h3>
            {!v ? <p className="fl-hint">—</p> : v.open ? <p className="fl-hint">{t('for')} {s.tally.for} · {t('against')} {s.tally.against}{v.kind === 'substantive' ? ` · ${t('abstain')} ${s.tally.abstain}` : ''}</p>
              : <div className={`rm-result ${v.result.passed ? 'ok' : 'bad'}`}>{v.result.passed ? t('passes') : t('fails')}<small>{v.result.for}–{v.result.against}–{v.result.abstain}</small></div>}
          </div>
        </div>
      </div>
      {seatHeader && canChat && <ChatWatcher code={code} headers={{ 'x-seat': seatHeader }} open={panel === 'chat'} onUnread={setUnread} />}
      {panel === 'chat' && seatHeader && <Drawer title={t('chat')} onClose={() => setPanel(null)} className="fl-chat"><RoomChat s={s} t={t} code={code} headers={{ 'x-seat': seatHeader }} me={seat!.delegateId} /></Drawer>}
      {panel === 'docs' && seat && <Drawer title={t('documents')} onClose={() => setPanel(null)} wide><DocsPanel s={s} t={t} seat={{ ...seat, post }} /></Drawer>}
    </div>
  );
}

export { DocsPanel, Modal };
