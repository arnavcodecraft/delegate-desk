import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlarmClockPlus, Check, ClipboardList, Copy, CornerUpRight, Crown, Eye, EyeOff, FileText, Gavel, GripVertical, Hand, Infinity as InfinityIcon, KeyRound, Languages,
  ListChecks, ListOrdered, MessageCircle, MonitorSmartphone, PanelLeftClose, PanelLeftOpen, Pause, Pencil, Play, Plus, Power, Reply, RotateCcw, Scale, Search, Send,
  Settings, ShieldBan, SkipForward, Star, Trophy, Users, Vote, X, ChevronUp, ChevronDown, Calculator, DoorOpen, Handshake, RefreshCw, ScrollText,
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

/** A small half-circle gauge for the quorum numbers in the sidebar. */
function Gauge({ label, value, of, tone }: { label: string; value: number; of: number; tone?: 'ok' | 'bad' }) {
  const p = of ? Math.min(1, value / of) : 0;
  const r = 18, c = Math.PI * r;
  return (
    <div className={`rm-gauge ${tone ?? ''}`} title={`${label}: ${value}`}>
      <span className="rm-gauge-k">{label}</span>
      <svg viewBox="0 0 44 26" width="44" height="26" aria-hidden><path d="M4 22 A18 18 0 0 1 40 22" className="tr" /><path d="M4 22 A18 18 0 0 1 40 22" className="fg" style={{ strokeDasharray: `${c * p} ${c}` }} /></svg>
      <b>{value}</b>
    </div>
  );
}

function Modal({ title, onClose, children, wide, className }: { title?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="rm-modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`rm-sheet ${wide ? 'wide' : ''} ${className ?? ''}`}>
        {title && <div className="rm-sheet-head"><h2>{title}</h2><button className="rm-x" onClick={onClose} aria-label="Close"><X /></button></div>}
        {!title && <button className="rm-x floating" onClick={onClose} aria-label="Close"><X /></button>}
        {children}
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`rm-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i>{on && <Check />}</i></button>;
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
      <input value={q} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { setHi((h) => Math.min(list.length - 1, h + 1)); e.preventDefault(); } if (e.key === 'ArrowUp') { setHi((h) => Math.max(0, h - 1)); e.preventDefault(); } if (e.key === 'Enter' && list[hi]) { pick(list[hi].id); e.preventDefault(); } }} />
      {open && q && list.length > 0 && <div className="rm-pick-list" role="listbox">{list.map((d: any, i: number) => <button key={d.id} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(d.id); }}><Flag code={d.code} round title={d.name} />{d.name}</button>)}</div>}
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
  const [tab, setTab] = useState<'speakers' | 'roll' | 'motions' | 'docs'>('speakers');
  const [panel, setPanel] = useState<null | 'settings' | 'chat' | 'scores' | 'dais' | 'raise'>(null);
  const [side, setSide] = useState(() => store.get('dd-room-side') !== 'closed');
  const [meta, setMeta] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => { api.get('/api/live/meta').then(setMeta).catch(() => {}); }, []);
  useEffect(() => store.set('dd-room-side', side ? 'open' : 'closed'), [side]);
  const run: Run = async (a) => { setErr(null); try { await act(a); } catch (e: any) { setErr(e.message); setTimeout(() => setErr(null), 5000); } };
  if (!key) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">This device isn't the chair</h2><p>Open the room from the device that started the session, or from your organiser dashboard.</p><Link className="pf-btn ghost" to={`/session/${code}`}>Open the delegate view</Link></div></PlatformShell>;
  if (error && !s) return <PlatformShell><div className="pf-empty">{error}</div></PlatformShell>;
  if (!s) return <PlatformShell><div className="pf-empty">Connecting…</div></PlatformShell>;
  if (!s.isChair) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">The chair key on this device is out of date</h2><p>Reopen the room from your dashboard.</p></div></PlatformShell>;
  const t = tr(s.settings?.language);
  const headers = { 'x-chair-key': key };
  return (
    <div className={`rm ${side ? '' : 'side-closed'}`} dir={s.settings?.language === 'ar' ? 'rtl' : 'ltr'} data-testid="chair-room">
      <Sidebar s={s} t={t} run={run} tab={tab} setTab={setTab} onClose={() => setSide(false)} />
      <main className="rm-main">
        <header className="rm-top">
          {!side && <button className="rm-icon" onClick={() => setSide(true)} aria-label="Show delegations"><PanelLeftOpen /></button>}
          <nav className="rm-tabs" role="tablist">
            {([['speakers', t('speakers'), ListOrdered], ['roll', t('rollCall'), ListChecks], ['motions', t('motions'), Gavel], ['docs', t('documents'), FileText]] as const).map(([k, l, I]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k === 'roll' && s.mode !== 'roll_call') run({ type: 'roll_call', on: true }); }}><I />{l}{k === 'motions' && s.motions.some((m: any) => m.status === 'pending') ? <em>{s.motions.filter((m: any) => m.status === 'pending').length}</em> : null}{k === 'docs' && (s.docs ?? []).some((d: any) => d.status === 'pending') ? <em>{(s.docs ?? []).filter((d: any) => d.status === 'pending').length}</em> : null}</button>
            ))}
          </nav>
          <div className="rm-tools">
            <span className="rm-mode">{t(MODE_KEY[s.mode] ?? 'inSession')}</span>
            <CodeChip code={code} />
            <button className="rm-icon" onClick={() => setPanel('chat')} aria-label={t('chat')} title={t('chat')}><MessageCircle />{unread > 0 && <em>{unread}</em>}</button>
            <button className="rm-icon" onClick={() => setPanel('scores')} aria-label={t('scores')} title={t('scores')}><Trophy /></button>
            <button className="rm-icon" onClick={() => setPanel('dais')} aria-label="Executive Board" title="Executive Board and log"><Users />{(s.pending?.length ?? 0) > 0 && <em>{s.pending.length}</em>}</button>
            <button className="rm-icon" onClick={() => setPanel('settings')} aria-label={t('settings')} title={t('settings')} data-testid="room-settings"><Settings /></button>
            <button className="rm-icon danger" title={t('end')} aria-label={t('end')} onClick={async () => { if (confirm('End this session? It becomes read-only.')) { await fetch(`/api/live/${code}/end`, { method: 'POST', headers }); nav('/session'); } }}><Power /></button>
          </div>
        </header>
        {err && <div className="rm-err" role="alert">{err}</div>}
        {s.ended && <div className="rm-err">This session has ended. It is read-only.</div>}
        <section className="rm-stage">
          {s.vote && tab !== 'roll' ? <VotePanel s={s} t={t} run={run} /> : tab === 'speakers' ? <SpeakerStage s={s} t={t} run={run} left={left} /> : tab === 'roll' ? <RollCall s={s} t={t} run={run} done={() => { run({ type: 'roll_call', on: false }); setTab('speakers'); }} />
            : tab === 'motions' ? <MotionsPanel s={s} t={t} run={run} onRaise={() => setPanel('raise')} /> : <DocsPanel s={s} t={t} run={run} />}
        </section>
        {tab === 'speakers' && !s.vote && <SpeakerBar s={s} t={t} run={run} />}
      </main>
      <ChatWatcher code={code} headers={headers} open={panel === 'chat'} onUnread={setUnread} />
      {panel === 'chat' && <Modal onClose={() => setPanel(null)} wide className="rm-chat-sheet"><RoomChat s={s} t={t} code={code} headers={headers} me="chair" /></Modal>}
      {panel === 'settings' && <SettingsModal s={s} t={t} run={run} code={code} chairKey={key} onClose={() => setPanel(null)} />}
      {panel === 'raise' && <RaiseMotion s={s} t={t} run={run} meta={meta} onClose={() => setPanel(null)} />}
      {panel === 'scores' && <Modal title={t('scores')} onClose={() => setPanel(null)} wide><Scores s={s} run={run} code={code} chairKey={key} meta={meta} /></Modal>}
      {panel === 'dais' && <Modal title="Executive Board" onClose={() => setPanel(null)} wide><Dais s={s} t={t} code={code} chairKey={key} run={run} /></Modal>}
    </div>
  );
}

function CodeChip({ code }: { code: string }) {
  const [ok, setOk] = useState(false);
  return <button className="rm-code" title={`Delegates join at ${location.host}/session with this code. Click to copy the link.`} onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/session/${code}`); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* blocked */ } }}>{ok ? <Check /> : <Copy />}{code}</button>;
}

// ---------- sidebar: committee, quorum, delegations ----------
function Sidebar({ s, t, run, tab, setTab, onClose }: { s: any; t: T; run: Run; tab: string; setTab: (x: any) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const q2 = s.quorum;
  const list = s.delegates.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const pos = (id: string) => s.speakers.queue.indexOf(id);
  const click = (d: any) => {
    if (tab === 'roll') { run({ type: 'presence', delegateId: d.id, presence: d.presence === 'absent' ? 'present' : d.presence === 'present' ? 'present_voting' : 'absent' }); return; }
    if (d.presence === 'absent') { run({ type: 'presence', delegateId: d.id, presence: 'present' }).then(() => run({ type: 'speaker_add', delegateId: d.id })); return; }
    if (pos(d.id) >= 0) run({ type: 'speaker_remove', delegateId: d.id }); else if (s.speakers.current !== d.id) run({ type: 'speaker_add', delegateId: d.id });
    setTab('speakers');
  };
  return (
    <aside className="rm-side" aria-label="Delegations">
      <div className="rm-com">
        <div className="rm-emblem" aria-hidden>{(s.committee.short || s.committee.name).slice(0, 4)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rm-com-short">{s.committee.short || s.committee.name}</div>
          {s.committee.short && <div className="rm-com-name">{s.committee.name}</div>}
          {topic == null ? <button className="rm-topic" onClick={() => setTopic(s.topic ?? '')}><b>{t('topic')}:</b> {s.topic || '—'} <Pencil /></button>
            : <form onSubmit={(e) => { e.preventDefault(); run({ type: 'topic', topic }); setTopic(null); }}><input className="rm-topic-in" autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => { run({ type: 'topic', topic }); setTopic(null); }} aria-label={t('topic')} /></form>}
        </div>
        <button className="rm-icon ghost" onClick={onClose} aria-label="Hide delegations"><PanelLeftClose /></button>
      </div>
      <div className="rm-gauges">
        <Gauge label={t('present')} value={q2.present} of={q2.total} tone={q2.debate ? 'ok' : 'bad'} />
        <Gauge label={t('twoThirds')} value={q2.twoThirds} of={q2.present || 1} />
        <Gauge label={t('majority')} value={q2.majority} of={q2.present || 1} />
        <button className="rm-add" onClick={() => setAdding(true)}><Plus />{t('addSeat')}</button>
      </div>
      {adding && <form className="rm-addform" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await run({ type: 'add_delegate', name: String(f.get('n')), code: String(f.get('c') || '') || null }); setAdding(false); }}>
        <input name="n" placeholder="Delegation name" autoFocus required aria-label="Delegation name" /><input name="c" placeholder="Flag (e.g. in)" maxLength={6} aria-label="Two-letter country code" style={{ width: 92 }} />
        <button className="rm-btn sm primary">Add</button><button type="button" className="rm-btn sm" onClick={() => setAdding(false)}>{t('cancel')}</button>
      </form>}
      <div className="rm-search"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findDelegation')} aria-label={t('findDelegation')} /></div>
      <div className="rm-dels">
        {list.map((d: any) => {
          const p = pos(d.id);
          const cur = s.speakers.current === d.id;
          const sub = cur ? (s.timer.startedAt ? t('speaking') : t('readyToSpeak')) : p >= 0 ? `${t('onList')} · #${p + 1}` : s.speakers.requests.includes(d.id) ? t('askingToSpeak') : d.presence === 'absent' ? t('absent') : d.presence === 'present_voting' ? t('presentVoting') : '';
          return (
            <div key={d.id} className={`rm-del ${cur ? 'cur' : ''} ${p >= 0 ? 'queued' : ''} ${d.presence === 'absent' ? 'absent' : ''} ${drag === d.id ? 'drag' : ''}`}
              draggable={p >= 0} onDragStart={() => setDrag(d.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { if (drag && p >= 0) e.preventDefault(); }} onDrop={() => { if (drag && drag !== d.id && p >= 0) run({ type: 'speaker_move', delegateId: drag, to: p }); setDrag(null); }}>
              <button className="rm-del-main" onClick={() => click(d)} title={tab === 'roll' ? 'Tap to change presence' : p >= 0 ? 'Tap to take off the list' : 'Tap to add to the speakers list'}>
                <span className="rm-flag"><Flag code={d.code} round title={d.name} />{(p >= 0 || cur) && <em>{cur ? <Play /> : p + 1}</em>}</span>
                <span className="rm-del-name"><b>{d.name}{s.committee.veto.includes(d.id) && <Crown className="veto" aria-label="Veto power" />}</b>{sub && <small>{sub}</small>}</span>
              </button>
              {(s.online ?? []).includes(d.id) && <i className="rm-dot" title="Online on their device" />}
              {p >= 0 && <GripVertical className="rm-grip" aria-hidden />}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ---------- the floor: who is speaking, the timer and the controls ----------
function SpeakerStage({ s, t, run, left }: { s: any; t: T; run: Run; left: number }) {
  const [yieldOpen, setYieldOpen] = useState(false);
  const [rtrOpen, setRtrOpen] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const cur = delOf(s, s.speakers.current);
  const running = !!s.timer.startedAt;
  const pct = s.timer.duration ? (left / s.timer.duration) * 100 : 0;
  const caucus = !cur && s.timer.duration > 0;
  const listTitle = ['moderated', 'tour', 'unmoderated', 'consultation'].includes(s.mode) ? t(MODE_KEY[s.mode]) : t('gsl');
  return (
    <div className="rm-floor">
      <div className="rm-floor-title"><ListOrdered />{listTitle}{s.mode === 'moderated' && s.timer.label && !cur ? ` · ${s.timer.label.replace(/^Moderated caucus:?\s*/, '')}` : ''}</div>
      {s.speakers.requests.length > 0 && <div className="rm-requests"><Hand />{t('askingToSpeak')}:{s.speakers.requests.map((id: string) => <span key={id}><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}<button onClick={() => run({ type: 'request_decide', delegateId: id, accept: true })} aria-label="Accept"><Check /></button><button onClick={() => run({ type: 'request_decide', delegateId: id, accept: false })} aria-label="Decline"><X /></button></span>)}</div>}
      {s.speakers.queue.length > 0 && <div className="rm-queue" aria-label="Speakers list">
        {s.speakers.queue.map((id: string, i: number) => { const d = delOf(s, id); return (
          <div key={id} className={`rm-q ${drag === id ? 'drag' : ''}`} draggable onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => drag && e.preventDefault()} onDrop={() => { if (drag && drag !== id) run({ type: 'speaker_move', delegateId: drag, to: i }); setDrag(null); }}>
            <span className="rm-q-flag"><Flag code={d?.code} round title={d?.name} /><button onClick={() => run({ type: 'speaker_remove', delegateId: id })} aria-label={`Remove ${d?.name}`}><X /></button></span>
            <small>{d?.name}</small>
          </div>); })}
        {s.speakers.queue.length > 1 && <button className="rm-link" onClick={() => confirm('Clear the speakers list?') && run({ type: 'speaker_clear' })}>Clear</button>}
      </div>}
      {cur ? <div className="rm-now">
        <div className="rm-bigflag"><Flag code={cur.code} round title={cur.name} /></div>
        <h1>{cur.name}</h1>
        <div className="rm-now-sub">{s.timer.label && s.timer.label !== cur.name ? s.timer.label : running ? t('speaking') : t('readyToSpeak')}</div>
      </div> : caucus ? <div className="rm-now"><div className="rm-now-sub big">{s.timer.label}</div></div>
        : !s.speakers.queue.length ? <div className="rm-empty">{t('emptyList')}</div> : <div className="rm-now"><div className="rm-now-sub">{t('next')}: <b>{nameOf(s, s.speakers.queue[0])}</b></div></div>}
      {(cur || caucus) && <>
        <div className={`rm-timer ${left > 0 && left <= 10 ? 'low' : ''} ${left === 0 && s.timer.duration ? 'out' : ''}`} aria-live="off">{fmt(left)}</div>
        <div className="rm-bar"><i style={{ width: `${pct}%` }} /></div>
      </>}
      {cur && s.settings?.rateSpeeches && <div className="rm-stars" aria-label="Rate this speech">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => run({ type: 'rate', delegateId: cur.id, stars: n })} aria-label={`${n} stars`}><Star /></button>)}</div>}
      {cur && s.marking?.enabled && <div style={{ width: '100%', maxWidth: 760 }}><FloorMarking s={s} run={run} /></div>}
      <div className="rm-controls">
        <button className="rm-ctl sq" onClick={() => run({ type: 'timer', op: 'reset' })} aria-label={t('reset')} title={t('reset')} disabled={!s.timer.duration}><RotateCcw /></button>
        {running ? <button className="rm-ctl main" onClick={() => run({ type: 'timer', op: 'pause' })}><Pause />{t('pause')}</button>
          : <button className="rm-ctl main" disabled={!s.timer.remaining && !s.speakers.queue.length} onClick={() => (s.timer.remaining ? run({ type: 'timer', op: 'start' }) : run({ type: 'speaker_next', start: true }))}><Play />{t('start')}</button>}
        <button className="rm-ctl next" onClick={() => run({ type: 'speaker_next', start: false })} disabled={!s.speakers.queue.length && !cur}><SkipForward />{t('next')}</button>
        <button className="rm-ctl sq soft" onClick={() => run({ type: 'timer', op: 'add', seconds: 15 })} aria-label={`${t('extend')} (15s)`} title={`${t('extend')} (+15s)`} disabled={!s.timer.duration}><AlarmClockPlus /></button>
        <div className="rm-pop-wrap">
          <button className="rm-ctl sq ghost" onClick={() => setYieldOpen(!yieldOpen)} disabled={!cur} title={t('yield')}><CornerUpRight /><small>{t('yield')}</small></button>
          {yieldOpen && cur && <div className="rm-pop" onMouseLeave={() => setYieldOpen(false)}>
            <button onClick={() => { run({ type: 'yield', to: 'chair' }); setYieldOpen(false); }}>{t('yieldChair')}</button>
            <button onClick={() => { run({ type: 'yield', to: 'questions' }); setYieldOpen(false); }}>{t('yieldQuestions')}</button>
            <div className="rm-pop-k">{t('yieldDelegate')}</div>
            <DelegationPicker s={s} placeholder={t('findDelegation')} filter={(d) => d.id !== cur.id && d.presence !== 'absent'} onPick={(id) => { run({ type: 'yield', to: id }); setYieldOpen(false); }} autoFocus />
          </div>}
        </div>
        <div className="rm-pop-wrap">
          <button className="rm-ctl sq warm" onClick={() => setRtrOpen(!rtrOpen)} title={t('rtr')}><Reply /><small>RTR</small></button>
          {rtrOpen && <div className="rm-pop right" onMouseLeave={() => setRtrOpen(false)}>
            <div className="rm-pop-k">{t('rtr')}</div>
            <DelegationPicker s={s} placeholder={t('findDelegation')} filter={(d) => d.presence !== 'absent'} onPick={(id) => { run({ type: 'rtr', delegateId: id, seconds: 30 }); setRtrOpen(false); }} autoFocus />
          </div>}
        </div>
      </div>
    </div>
  );
}

function SpeakerBar({ s, t, run }: { s: any; t: T; run: Run }) {
  const [custom, setCustom] = useState(String(s.speakers.speakingTime));
  useEffect(() => setCustom(String(s.speakers.speakingTime)), [s.speakers.speakingTime]);
  return (
    <div className="rm-bottom">
      <DelegationPicker s={s} placeholder={t('addToList')} filter={(d) => !s.speakers.queue.includes(d.id) && s.speakers.current !== d.id}
        onPick={async (id) => { if (delOf(s, id)?.presence === 'absent') await run({ type: 'presence', delegateId: id, presence: 'present' }); run({ type: 'speaker_add', delegateId: id }); }} />
      <span className="rm-time-k">{t('time')}</span>
      {[45, 60, 75, 90].map((n) => <button key={n} className={`rm-chip ${s.speakers.speakingTime === n ? 'on' : ''}`} onClick={() => run({ type: 'speaking_time', seconds: n })}>{n}s</button>)}
      <input className="rm-chip-in" type="number" min={10} max={600} value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => Number(custom) !== s.speakers.speakingTime && Number(custom) >= 10 && run({ type: 'speaking_time', seconds: Number(custom) })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Speaking time in seconds" />
    </div>
  );
}

// ---------- roll call ----------
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
            <Flag code={d.code} round title={d.name} /><span>{d.name}</span>
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

function RaiseMotion({ s, t, run, meta, onClose }: { s: any; t: T; run: Run; meta: any; onClose: () => void }) {
  const ranked = (s.settings?.motions ?? []).filter((m: any) => m.on).map((m: any) => m.key).reverse();   // least disruptive first, as delegates usually raise them
  const types: string[] = [...ranked.filter((k: string) => k === 'moderated' || k === 'unmoderated'), ...ranked.filter((k: string) => k !== 'moderated' && k !== 'unmoderated'), ...(s.settings?.customMotion ? ['custom'] : [])];
  const more = ['open_debate', 'set_agenda', 'speaking_time', 'table', 'adjourn'];
  const [type, setType] = useState(types[0] ?? 'moderated');
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
    <Modal onClose={onClose} wide className="rm-raise">
      <h2 className="rm-raise-h">{t('raiseMotion')}</h2>
      <div className="rm-types">
        {types.map((k) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{label(k)}</button>)}
        <div className="rm-types-x">
          <button className={`danger ${type === 'suspend' ? 'on' : ''}`} onClick={() => setType('suspend')}>{label('suspend')}</button>
          <button className={`danger ${type === 'close_debate' ? 'on' : ''}`} onClick={() => setType('close_debate')}>{label('close_debate')}</button>
        </div>
      </div>
      <div className="rm-more">{more.map((k) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{label(k)}</button>)}</div>
      {needTopic && <label className="rm-field"><span>{type === 'set_agenda' ? t('topic') : type === 'custom' ? 'Motion' : t('topic')} <i>*</i></span><input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder={type === 'custom' ? 'e.g. Motion to introduce a guest speaker' : 'e.g. Humanitarian response in conflict zones'} autoFocus /></label>}
      <label className="rm-field"><span className="g">{t('proposedBy')}</span>
        {f.proposer ? <div className="rm-picked"><Flag code={delOf(s, f.proposer)?.code} round />{nameOf(s, f.proposer)}<button onClick={() => setF({ ...f, proposer: '' })} aria-label="Change"><X /></button></div>
          : <DelegationPicker s={s} placeholder="Type country name…" filter={(d) => d.presence !== 'absent'} onPick={(id) => setF({ ...f, proposer: id })} />}
      </label>
      {(mt.needsDuration || mt.needsSpeakingTime || type === 'custom') && <div className="rm-times">
        {(mt.needsDuration || type === 'custom') && <div>
          <span className="rm-k">{t('totalTime')}{type === 'custom' ? ' (optional)' : ''}</span>
          <div className="rm-num"><label><input type="number" min={0} max={120} value={f.min} onChange={(e) => setF({ ...f, min: Math.max(0, Number(e.target.value)) })} aria-label="Minutes" /><small>min</small></label><label><input type="number" min={0} max={59} value={f.sec} onChange={(e) => setF({ ...f, sec: Math.max(0, Math.min(59, Number(e.target.value))) })} aria-label="Seconds" /><small>sec</small></label></div>
          <div className="rm-presets">{[2, 5, 10, 15, 20].map((m) => <button key={m} className={f.min === m && !f.sec ? 'on' : ''} onClick={() => setF({ ...f, min: m, sec: 0 })}>{m}m</button>)}</div>
        </div>}
        {mt.needsSpeakingTime && <div>
          <span className="rm-k">{t('perDelegate')}</span>
          <div className="rm-num"><label><input type="number" min={10} max={600} value={f.each} onChange={(e) => setF({ ...f, each: Number(e.target.value) })} aria-label="Seconds per delegate" /><small>sec</small></label></div>
          <div className="rm-presets">{[30, 45, 60, 90, 120].map((n) => <button key={n} className={f.each === n ? 'on' : ''} onClick={() => setF({ ...f, each: n })}>{n}s</button>)}</div>
          {mt.needsDuration && f.each > 0 && <div className="rm-cando"><b>{Math.floor(total / f.each)}</b> {t('canSpeak')}</div>}
        </div>}
      </div>}
      <div className="rm-raise-foot"><button className="rm-btn primary block" disabled={!ok} onClick={submit}>{t('raiseMotion')} →</button></div>
    </Modal>
  );
}

// ---------- voting ----------
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
          <Flag code={d.code} round title={d.name} /><span>{d.name}{s.committee.veto.includes(d.id) && v.kind === 'substantive' && <Crown className="veto" />}{rights && <small> · {t('withRights')}</small>}</span>
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
          {d.sponsors.length > 0 && <div className="rm-doc-who"><span>{c.sponsorsLabel}</span>{d.sponsors.map((id: string) => <span key={id} className="rm-mini"><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}</span>)}</div>}
          {d.signatories.length > 0 && <div className="rm-doc-who"><span>{t('signatories')}</span>{d.signatories.map((id: string) => <span key={id} className="rm-mini"><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}</span>)}</div>}
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
      <div className="rm-chips">{f[k].map((id) => <span key={id} className="rm-mini"><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}<button type="button" onClick={() => setF({ ...f, [k]: f[k].filter((x) => x !== id) })} aria-label="Remove"><X /></button></span>)}</div>
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
  const [mobileThread, setMobileThread] = useState(false);
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
  const Avatar = ({ id }: { id: string }) => id === 'all' ? <span className="rm-av all"><MessageCircle /></span> : id === 'chair' ? <span className="rm-av chair"><Gavel /></span> : <span className="rm-av"><Flag code={delOf(s, id)?.code} round title={nameOf(s, id)} /></span>;
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
function SettingsModal({ s, t, run, code, chairKey, onClose }: { s: any; t: T; run: Run; code: string; chairKey: string; onClose: () => void }) {
  const [tab, setTab] = useState<'access' | 'motions' | 'voting' | 'points' | 'people'>('access');
  const c = s.settings;
  const set = (patch: any) => run({ type: 'settings', patch });
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const items = [['access', 'Access', KeyRound], ['motions', t('motions'), ListOrdered], ['voting', 'Voting', Vote], ['points', 'Points', Star], ['people', 'People', Users]] as const;
  const heads: Record<string, [string, string]> = { access: ['Access and the floor', 'Codes, the dais and what delegates can do.'], motions: ['Motions and documents', 'Motion order, names and papers.'], voting: ['Voting rules', 'What it takes to pass a resolution.'], points: ['Points and ranking', 'How delegates are scored and ranked.'], people: ['People in the room', 'Everyone connected right now.'] };
  return (
    <div className="rm-modal" role="dialog" aria-modal="true" aria-label={t('settings')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rm-settings">
        <nav className="rm-set-nav">
          <div className="rm-set-brand"><Settings />{t('settings')}</div>
          {items.map(([k, l, I]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I />{l}</button>)}
          <span style={{ flex: 1 }} />
          <div className="rm-set-lang"><span><Languages />Language</span><div className="rm-seg">{LANGS.map((l) => <button key={l.key} className={c.language === l.key ? 'on' : ''} onClick={() => set({ language: l.key })}>{l.label}</button>)}</div></div>
        </nav>
        <div className="rm-set-body">
          <div className="rm-set-head"><div><h2>{heads[tab][0]}</h2><p>{heads[tab][1]}</p></div><span className="rm-saved"><Check />Saves instantly</span><button className="rm-x" onClick={onClose} aria-label="Close"><X /></button></div>
          {tab === 'access' && <AccessTab s={s} c={c} set={set} run={run} code={code} chairKey={chairKey} />}
          {tab === 'motions' && <MotionsTab s={s} c={c} set={set} />}
          {tab === 'voting' && <VotingTab s={s} c={c} set={set} run={run} />}
          {tab === 'points' && <PointsTab c={c} set={set} />}
          {tab === 'people' && <PeopleTab s={s} run={run} code={code} chairKey={chairKey} />}
        </div>
      </div>
    </div>
  );
}

function Sec({ icon: I, title, hint, children, right }: { icon: any; title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <section className="rm-sec"><h3><I />{title}{hint && <span className="rm-info" title={hint}>i</span>}{right && <span className="rm-sec-right">{right}</span>}</h3>{children}</section>;
}

function AccessTab({ s, c, set, run, code, chairKey }: { s: any; c: any; set: (p: any) => void; run: Run; code: string; chairKey: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState('');
  const copy = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1400); } catch { /* blocked */ } };
  const chairLink = `${location.origin}/session/${code}/chair#k=${chairKey}`;
  const pending = s.pending ?? [];
  const perms = [
    ['chat', 'Chat', 'Delegations message everyone, the chair, and each other.', MessageCircle],
    ['selfStatus', 'Change own status', 'During roll call, delegations mark themselves present or present and voting.', ListChecks],
    ['openJoin', 'Join without approval', 'Off: delegations who join on a device wait until you let them in.', DoorOpen],
  ] as const;
  return <>
    <Sec icon={KeyRound} title="Join codes" hint="Delegates open the session page and type the code. Your chair link opens this room on another device: keep it private.">
      <div className="rm-codes">
        <button className="rm-codecard dark" onClick={() => copy('code', `${location.origin}/session/${code}`)}><span><KeyRound />Session code</span><b>{code}</b>{copied === 'code' ? <Check /> : <Copy />}</button>
        <div className="rm-codecard"><span><ShieldBan />Chair link</span><b className={show ? 'mono' : 'blur'}>{show ? chairLink.replace(/^https?:\/\//, '') : '••••••••••'}</b>
          <span className="rm-row"><button className="rm-icon ghost" onClick={() => setShow(!show)} aria-label={show ? 'Hide' : 'Show'}>{show ? <EyeOff /> : <Eye />}</button><button className="rm-icon ghost" onClick={() => copy('chair', chairLink)} aria-label="Copy chair link">{copied === 'chair' ? <Check /> : <Copy />}</button></span></div>
      </div>
    </Sec>
    <Sec icon={Users} title="The dais" hint="Everyone with a chair link. Invite a co-chair from the Executive Board panel.">
      <div className="rm-dais">{(s.eb ?? []).map((m: any, i: number) => <div key={i} className="rm-daisp"><span className="rm-av init">{m.name.slice(0, 2).toUpperCase()}<i className={m.online ? 'on' : ''} /></span><span><b>{m.name}{m.name === s.me ? ' (you)' : ''}</b><small><Gavel />{i === 0 ? 'Moderator' : 'Co-chair'}</small></span></div>)}</div>
    </Sec>
    <Sec icon={MonitorSmartphone} title="What delegates can do">
      <div className="rm-perms">{perms.map(([k, l, h, I]) => (
        <div key={k} className={`rm-perm ${c[k] ? 'on' : ''}`}>
          <div className="rm-perm-art"><I /></div>
          <div className="rm-perm-foot"><span><b>{l}</b><small>{h}</small></span><Toggle on={!!c[k]} onChange={(v) => set({ [k]: v })} label={l} /></div>
        </div>))}</div>
      {pending.length > 0 && <div className="rm-waiting"><b><DoorOpen /> {pending.length} in the waiting room</b>{pending.map((id: string) => <div key={id} className="rm-waitrow"><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}<span style={{ flex: 1 }} /><button className="rm-btn primary sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: true })}>Let in</button><button className="rm-btn sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: false })}>Deny</button></div>)}</div>}
    </Sec>
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
    <div className="rm-grid2">
      <Sec icon={ListOrdered} title="Motion types" hint="Top is the most disruptive: those are voted first. Switch off what your committee doesn't use; click a name to rename it.">
        <div className="rm-mlist">{ms.map((m, i) => (
          <div key={m.key} className={`rm-mrow ${m.on ? '' : 'off'}`}>
            <span className="rm-mrow-n">{i + 1}</span>
            <button className="rm-mrow-name" onClick={() => rename(m.key)}>{label(m.key)} <Pencil /></button>
            <span className="rm-bars" aria-label={`Disruptiveness ${ms.length - i} of ${ms.length}`}>{ms.map((_, j) => <i key={j} className={j < ms.length - i ? 'on' : ''} style={{ height: 6 + j * 4 }} />)}</span>
            <span className="rm-updown"><button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp /></button><button disabled={i === ms.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown /></button></span>
            <Toggle on={m.on} onChange={(v) => set({ motions: ms.map((x) => (x.key === m.key ? { ...x, on: v } : x)) })} label={label(m.key)} />
          </div>))}</div>
      </Sec>
      <Sec icon={Gavel} title="Other motions" hint="Custom motions let delegates propose anything else. Suspend and close debate are always available and voted first.">
        <div className="rm-olist">
          <div className="rm-orow"><span>Custom</span><small>Not ranked</small><Toggle on={c.customMotion} onChange={(v) => set({ customMotion: v })} label="Custom motions" /></div>
          <div className="rm-orow"><span>{label('suspend')}</span><small>Always on</small></div>
          <div className="rm-orow"><span>{label('close_debate')}</span><small>Always on</small></div>
          <div className="rm-orow"><span>{label('adjourn')}</span><small>Always on</small></div>
        </div>
      </Sec>
    </div>
    <Sec icon={FileText} title="Documents" hint="What papers are called in this committee, how many each kind can have, and whether you approve them before delegates see them." right={<small>Click a name to change it</small>}>
      <div className="rm-docset">
        {(['wp', 'dr'] as const).map((k) => <div key={k} className="rm-docset-card">
          <div className="rm-docset-row"><span className="rm-doc-tag">{k.toUpperCase()}</span><small>Singular</small><button onClick={() => editDoc(k, 'one')}>{docs[k].one} <Pencil /></button></div>
          <div className="rm-docset-row"><span /><small>Plural</small><button onClick={() => editDoc(k, 'many')}>{docs[k].many} <Pencil /></button></div>
          <div className="rm-docset-row foot"><small>Maximum {docs[k].many}</small>
            {docs[k].max == null ? <button className="rm-btn dark sm" onClick={() => set({ docs: { [k]: { max: 3 } } })}><InfinityIcon />No limit</button>
              : <span className="rm-step"><button onClick={() => set({ docs: { [k]: { max: docs[k].max > 1 ? docs[k].max - 1 : null } } })} aria-label="Fewer">−</button><b>{docs[k].max}</b><button onClick={() => set({ docs: { [k]: { max: Math.min(99, docs[k].max + 1) } } })} aria-label="More">+</button></span>}
          </div>
        </div>)}
        <div className="rm-docset-card plain">
          <div className="rm-orow"><span>Approve papers first</span><Toggle on={docs.approve} onChange={(v) => set({ docs: { approve: v } })} label="Approve papers first" /></div>
          <label className="rm-field"><span>Sponsors label</span><input defaultValue={docs.sponsorsLabel} onBlur={(e) => e.target.value !== docs.sponsorsLabel && set({ docs: { sponsorsLabel: e.target.value } })} placeholder="Sponsors" /></label>
        </div>
      </div>
    </Sec>
  </>;
}

function Dots({ filled, total = 12, rows = [3, 4, 5] }: { filled: number; total?: number; rows?: number[] }) {
  let n = 0;
  return <span className="rm-dots" aria-hidden>{rows.map((r, i) => <span key={i}>{Array.from({ length: r }, () => { n++; return <i key={n} className={n <= Math.round((filled / total) * 12) ? 'on' : ''} />; })}</span>)}</span>;
}

function VotingTab({ s, c, set, run }: { s: any; c: any; set: (p: any) => void; run: Run }) {
  const th = [['simple', 'Simple majority (1/2 + 1)', 'More For than half of the votes counted.', 7], ['two_thirds', '2/3 Supermajority', 'At least two thirds For.', 8], ['consensus', 'Consensus', 'Every delegation voting votes For.', 12]] as const;
  return <>
    <Sec icon={Scale} title="Pass threshold" hint="Used for substantive votes such as draft resolutions. Procedural motions always need a simple majority, or two-thirds for closing debate.">
      <div className="rm-choices4">
        {th.map(([k, l, h, n]) => <button key={k} className={`rm-choice ${c.threshold === k ? 'on' : ''}`} onClick={() => set({ threshold: k })}><Dots filled={n} /><b>{l}</b><small>{h}</small>{c.threshold === k && <Check className="rm-tick" />}</button>)}
        <div className="rm-choice soft"><span className="rm-ring" /><b>Allow abstentions</b><Toggle on={c.abstentions} onChange={(v) => set({ abstentions: v })} label="Allow abstentions" /></div>
      </div>
      <div className="rm-row" style={{ marginTop: 12, gap: 22 }}>
        <span className="rm-inline">Votes with rights <span className="rm-info" title="A delegation votes For or Against and asks to explain its vote afterwards.">i</span><Toggle on={c.withRights} onChange={(v) => set({ withRights: v })} label="Votes with rights" /></span>
        <span className="rm-inline">Pass <span className="rm-info" title="In a roll-call vote a delegation can pass and be asked again at the end.">i</span><Toggle on={c.allowPass} onChange={(v) => set({ allowPass: v })} label="Allow passing" /></span>
      </div>
    </Sec>
    <Sec icon={MonitorSmartphone} title="How delegations vote" hint="Roll call: you record each vote. Devices: delegations vote on their own phones.">
      <div className="rm-opts2">{([['roll_call', 'Roll call', ListChecks], ['devices', 'Devices', MonitorSmartphone]] as const).map(([k, l, I]) => <button key={k} className={`rm-opt ${c.voteMethod === k ? 'on' : ''}`} onClick={() => set({ voteMethod: k })}><I />{l}<span className="rm-radio" /></button>)}</div>
    </Sec>
    <Sec icon={ShieldBan} title="Veto power" hint="P5: the five permanent members (when in the room) can block a substantive vote. Custom: tap the crown next to delegations below.">
      <div className="rm-opts2">{([['none', 'No veto power', ShieldBan], ['p5', 'P5 veto power', Crown], ['unanimous', 'Unanimous decision required', Handshake], ['custom', 'Custom veto members', ListChecks]] as const).map(([k, l, I]) => <button key={k} className={`rm-opt ${c.veto === k ? 'on' : ''}`} onClick={() => set({ veto: k })}><I />{l}<span className="rm-radio" /></button>)}</div>
      {c.veto === 'custom' && <div className="rm-vetolist">{s.delegates.map((d: any) => { const on = s.committee.veto.includes(d.id); return <button key={d.id} className={on ? 'on' : ''} onClick={() => run({ type: 'set_veto', delegateId: d.id, on: !on })}><Flag code={d.code} round />{d.name}<Crown /></button>; })}</div>}
    </Sec>
    <Sec icon={Users} title="Quorum" hint="How many members must be present for debate to go on.">
      <div className="rm-choices4">{([['third', 'One third'], ['half', 'Half + 1'], ['two_thirds', 'Two thirds'], ['none', 'No quorum']] as const).map(([k, l]) => <button key={k} className={`rm-choice small ${c.quorum === k ? 'on' : ''}`} onClick={() => set({ quorum: k })}><b>{l}</b><small>{k === 'none' ? 'Debate any time' : `${({ third: Math.ceil(s.quorum.total / 3), half: Math.floor(s.quorum.total / 2) + 1, two_thirds: Math.ceil((s.quorum.total * 2) / 3) } as any)[k]} of ${s.quorum.total}`}</small>{c.quorum === k && <Check className="rm-tick" />}</button>)}</div>
    </Sec>
  </>;
}

function PointsTab({ c, set }: { c: any; set: (p: any) => void }) {
  const labels: Record<string, string> = { attendance: 'Attendance (P/PV)', gsl: 'GSL speech', caucus: 'Caucus speech', minute: 'Speaking time (per minute)', raised: 'Motion raised', passed: 'Motion passed', rtr: 'Right of reply', wp: 'Working paper', dr: 'Draft resolution', drPassed: 'Draft resolution passed' };
  const max = Math.max(1, ...Object.values(c.points).map((p: any) => p.pts));
  const blend = c.rateSpeeches ? c.blend : 100;
  return <div className="rm-points">
    <Sec icon={Calculator} title="Score sources" hint="Points each delegation earns automatically from what happens in the room.">
      <div className="rm-psrc">{Object.entries(labels).map(([k, l]) => { const p = c.points[k]; return (
        <div key={k} className={`rm-prow ${p.on ? '' : 'off'}`}>
          <Toggle on={p.on} onChange={(v) => set({ points: { [k]: { on: v } } })} label={l} />
          <span className="rm-prow-l">{l}</span>
          <span className="rm-step"><button onClick={() => set({ points: { [k]: { pts: Math.max(0, p.pts - 1) } } })} aria-label="Less">−</button><b>{p.pts}</b><small>pts</small><button onClick={() => set({ points: { [k]: { pts: Math.min(100, p.pts + 1) } } })} aria-label="More">+</button></span>
          <i className="rm-prow-bar" style={{ width: `${(p.pts / max) * 100}%` }} />
        </div>); })}</div>
    </Sec>
    <div className="rm-blend">
      <div className="rm-donut" style={{ ['--p' as any]: blend }}><div><Star /><b>Ranking blend</b><strong>{blend} <span>/</span> <em>{100 - blend}</em></strong><small><i className="o" />Objective {blend}% <i className="q" />Quality {100 - blend}%</small></div></div>
      <Sec icon={Star} title="Quality factors" hint="Turn on to rate each speech from 1 to 5 stars on the floor. The ranking then blends points with ratings.">
        <div className="rm-orow"><span>Rate speeches</span><Toggle on={c.rateSpeeches} onChange={(v) => set({ rateSpeeches: v })} label="Rate speeches" /></div>
        <label className="rm-slider"><span>{blend} / {100 - blend}</span><input type="range" min={0} max={100} step={5} value={blend} disabled={!c.rateSpeeches} onChange={(e) => set({ blend: Number(e.target.value) })} aria-label="Objective versus quality" /><span className="rm-row between"><small>Objective</small><small>Quality</small></span></label>
        <div className="rm-example"><div><small>Points share</small><i style={{ width: '80%' }} /><b>80</b></div><div><small>Quality rating</small><i className="q" style={{ width: '60%' }} /><b>60</b></div><div><small><b>Headline score</b></small><i className="mix" style={{ width: `${(80 * blend + 60 * (100 - blend)) / 100}%` }} /><b>{Math.round((80 * blend + 60 * (100 - blend)) / 100)}</b></div></div>
      </Sec>
    </div>
  </div>;
}

function PeopleTab({ s, run, code, chairKey }: { s: any; run: Run; code: string; chairKey: string }) {
  const [q, setQ] = useState('');
  const online = new Set(s.online ?? []);
  const claimed = new Set(s.claimed ?? []);
  const list = s.delegates.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const release = async (id: string) => { if (!confirm('Reset this delegation’s device? Someone else can then join as them.')) return; await fetch(`/api/live/${code}/release`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chair-key': chairKey }, body: JSON.stringify({ delegateId: id }) }); };
  return <>
    <div className="rm-dais">{(s.eb ?? []).map((m: any, i: number) => <div key={i} className="rm-daisp col"><span className="rm-av init big">{m.name.slice(0, 2).toUpperCase()}<i className={m.online ? 'on' : ''} /></span><b>{m.name}</b><small>{m.online ? '(online)' : '(away)'}</small></div>)}</div>
    <Sec icon={MonitorSmartphone} title="Delegations" hint="A green dot means the delegation has the session open on its device now." right={<span className="rm-row"><RefreshCw className="rm-spin" aria-hidden /><small>{online.size} of {s.delegates.length} joined</small></span>}>
      <div className="rm-search inline" style={{ maxWidth: 300, marginBottom: 10 }}><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a delegation" aria-label="Find a delegation" /></div>
      <div className="rm-people">{list.map((d: any) => <div key={d.id} className="rm-person"><Flag code={d.code} round /><i className={`rm-dot ${online.has(d.id) ? 'on' : claimed.has(d.id) ? 'away' : 'none'}`} /><span>{d.name}</span>{claimed.has(d.id) && <button className="rm-link" onClick={() => release(d.id)} title="Reset device">reset</button>}</div>)}</div>
    </Sec>
  </>;
}

// ---------- scores: points ranking and EB marking ----------
function Scores({ s, run, code, chairKey, meta }: { s: any; run: Run; code: string; chairKey: string; meta: any }) {
  const [view, setView] = useState<'ranking' | 'marking'>('ranking');
  const rows = s.ranking ?? [];
  return <div className="rm-scores">
    <div className="rm-seg wide big" style={{ marginBottom: 14 }}><button className={view === 'ranking' ? 'on' : ''} onClick={() => setView('ranking')}><Trophy />Points ranking</button><button className={view === 'marking' ? 'on' : ''} onClick={() => setView('marking')}><ClipboardList />EB marking{s.marking ? '' : ' (off)'}</button></div>
    {view === 'ranking' ? <>
      <p className="rm-hint">Points come from what happens in the room, weighted in Settings → Points{s.settings?.rateSpeeches ? ', blended with your speech ratings' : ''}. Delegates never see this.</p>
      <div className="rm-rank">
        <div className="rm-rank-row head"><span>#</span><span>Delegation</span><span>Speeches</span><span>Time</span><span>Points</span>{s.settings?.rateSpeeches && <span>Quality</span>}<span>Score</span></div>
        {rows.map((r: any, i: number) => <div key={r.id} className={`rm-rank-row ${i < 3 && r.points ? `top${i + 1}` : ''}`}><span>{i + 1}</span><span className="rm-rank-name"><Flag code={r.code} round />{r.name}</span><span>{r.speeches}</span><span>{fmt(r.seconds)}</span><span>{r.points}</span>{s.settings?.rateSpeeches && <span>{r.quality ?? '—'}</span>}<span><b>{r.score}</b></span></div>)}
      </div>
    </> : s.marking ? <MarkingBoard s={s} run={run} code={code} chairKey={chairKey} /> : <MarkingOff run={run} presets={meta?.presets ?? []} />}
  </div>;
}

function Dais({ s, t, code, chairKey, run }: { s: any; t: T; code: string; chairKey: string; run: Run }) {
  const pending = s.pending ?? [];
  return <div className="rm-daisdrawer">
    {pending.length > 0 && <div className="rm-waiting"><b><DoorOpen /> {pending.length} in the waiting room</b>{pending.map((id: string) => <div key={id} className="rm-waitrow"><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}<span style={{ flex: 1 }} /><button className="rm-btn primary sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: true })}>Let in</button><button className="rm-btn sm" onClick={() => run({ type: 'seat_decide', delegateId: id, accept: false })}>Deny</button></div>)}</div>}
    <EbRoom s={s} code={code} chairKey={chairKey} run={run} />
    <div className="rm-card" style={{ marginTop: 14 }}><h3><ScrollText /> Log</h3><div className="rm-log">{!s.log.length ? <p className="rm-hint">Nothing yet</p> : s.log.map((l: any, i: number) => <div key={i}><time>{new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>{l.text}</div>)}</div></div>
    <p className="rm-hint" style={{ marginTop: 10 }}>{t('inSession')} · {s.quorum.present}/{s.quorum.total} {t('present').toLowerCase()}</p>
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
  // The chair reset this device: forget the seat.
  useEffect(() => { if (s && seat && !me) { store.del(`dd-live-seat-${code}`); setSeat(null); } }, [s?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error && !s) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">Session not found</h2><p>Check the code with your chair.</p><Link className="pf-btn ghost" to="/session">Back</Link></div></PlatformShell>;
  if (!s) return <PlatformShell><div className="pf-empty">Connecting…</div></PlatformShell>;
  const t = tr(s.settings?.language);
  const cur = delOf(s, s.speakers.current);
  const pct = s.timer.duration ? (left / s.timer.duration) * 100 : 0;
  const waiting = !!s.waiting;
  const v = s.vote;
  const myBallot = v && me ? v.ballots[me.id] : null;
  const myRights = v && me ? (v.rights ?? []).includes(me.id) : false;
  const canChat = !!me && !waiting && s.settings?.chat;
  const ballotOpts = me && v ? ['for', 'against', ...(v.kind === 'substantive' && s.settings?.abstentions !== false && me.presence !== 'present_voting' ? ['abstain'] : []), ...(v.kind === 'substantive' && s.settings?.allowPass ? ['pass'] : [])] : [];
  return (
    <div className="rd" dir={s.settings?.language === 'ar' ? 'rtl' : 'ltr'} data-testid="delegate-room">
      <header className="rd-top">
        <Link to="/" className="rd-brand" aria-label="DelegateDesk home">DD</Link>
        <div className="rd-com"><b>{s.committee.short || s.committee.name}</b><small>{t(MODE_KEY[s.mode] ?? 'inSession')}{s.ended ? ' · ended' : ''}</small></div>
        <span style={{ flex: 1 }} />
        {me && !waiting && <button className="rm-icon" onClick={() => setPanel('docs')} aria-label={t('documents')} title={t('documents')}><FileText /></button>}
        {canChat && <button className="rm-icon" onClick={() => setPanel('chat')} aria-label={t('chat')} title={t('chat')}><MessageCircle />{unread > 0 && <em>{unread}</em>}</button>}
      </header>
      <div className="rd-body">
        {s.topic && <div className="rd-topic">{t('topic')}: <b>{s.topic}</b></div>}
        <div className="rd-stage">
          {cur ? <><div className="rd-flag"><Flag code={cur.code} round title={cur.name} /></div><h1>{cur.name}</h1><div className="rm-now-sub">{s.timer.startedAt ? t('speaking') : t('readyToSpeak')}</div></>
            : <div className="rm-now-sub big">{s.timer.duration ? s.timer.label : t('noFloor')}</div>}
          {s.timer.duration > 0 && <><div className={`rm-timer sm ${left > 0 && left <= 10 ? 'low' : ''}`}>{fmt(left)}</div><div className="rm-bar"><i style={{ width: `${pct}%` }} /></div></>}
          <div className="rd-quorum">{s.quorum.present}/{s.quorum.total} {t('present').toLowerCase()} · {s.quorum.debate ? t('quorum') : t('noQuorum')}</div>
        </div>

        {!seat || !me ? (
          <div className="rd-card">
            <h2>{t('join')}</h2>
            <p className="rm-hint">Pick your delegation to ask to speak, mark yourself at roll call, message the room and vote from this device. One device per delegation.</p>
            <div className="rm-search inline"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('findDelegation')} aria-label={t('findDelegation')} /></div>
            <div className="rd-join">{s.delegates.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase())).map((d: any) => <button key={d.id} onClick={async () => { try { const out = await post('claim', { delegateId: d.id }); const x = { delegateId: d.id, seatToken: out.seatToken }; store.set(`dd-live-seat-${code}`, JSON.stringify(x)); setSeat(x); } catch (e: any) { say(e.message); } }}><Flag code={d.code} round title={d.name} />{d.name}</button>)}</div>
          </div>
        ) : waiting ? (
          <div className="rd-card center"><DoorOpen className="rd-big-ic" /><h2>{t('waiting')}</h2><p className="rm-hint">You joined as <b>{me.name}</b>. This page updates by itself.</p></div>
        ) : (
          <div className="rd-card">
            <div className="rd-me"><Flag code={me.code} round title={me.name} /><span><b>{me.name}</b><small>{me.presence === 'absent' ? t('absent') : me.presence === 'present_voting' ? t('presentVoting') : t('present')}</small></span></div>
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
          <div className="rd-card"><h3><ListOrdered />{t('gsl')}</h3>
            {!s.speakers.queue.length ? <p className="rm-hint">—</p> : <ol className="rd-list">{s.speakers.queue.map((id: string) => <li key={id} className={id === me?.id ? 'me' : ''}><Flag code={delOf(s, id)?.code} round />{nameOf(s, id)}</li>)}</ol>}
          </div>
          <div className="rd-card"><h3><Vote />{v ? v.title : t('vote')}</h3>
            {!v ? <p className="rm-hint">—</p> : v.open ? <p className="rm-hint">{t('for')} {s.tally.for} · {t('against')} {s.tally.against}{v.kind === 'substantive' ? ` · ${t('abstain')} ${s.tally.abstain}` : ''}</p>
              : <div className={`rm-result ${v.result.passed ? 'ok' : 'bad'}`}>{v.result.passed ? t('passes') : t('fails')}<small>{v.result.for}–{v.result.against}–{v.result.abstain}</small></div>}
          </div>
        </div>
      </div>
      {seatHeader && canChat && <ChatWatcher code={code} headers={{ 'x-seat': seatHeader }} open={panel === 'chat'} onUnread={setUnread} />}
      {panel === 'chat' && seatHeader && <Modal onClose={() => setPanel(null)} wide className="rm-chat-sheet"><RoomChat s={s} t={t} code={code} headers={{ 'x-seat': seatHeader }} me={seat!.delegateId} /></Modal>}
      {panel === 'docs' && seat && <Modal onClose={() => setPanel(null)} wide><DocsPanel s={s} t={t} seat={{ ...seat, post }} /></Modal>}
    </div>
  );
}

export { DocsPanel, Modal };
