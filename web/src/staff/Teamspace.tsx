import { useEffect, useMemo, useState } from 'react';
import { AtSign, Bell, CalendarDays, CheckCircle2, ClipboardList, EyeOff, Eye, HelpCircle, MessageSquareReply, Megaphone, NotebookPen, Plus, Trash2, Users, Briefcase, ArrowLeft, ArrowRight, Pencil, Save, ThumbsUp, Archive } from 'lucide-react';
import { api } from '../api';
import { Alert, Btn, Field, Loading, Modal, Segmented, Tabs, useAsync, useToast } from '../ui';
import { PageHead, useStaff } from './Shell';
import { groupByDay, JoinMeeting, ScheduleRow } from '../chat/DelegateChat';
import { CallRoom, type CallTarget } from '../calls/CallRoom';
import { formatText } from '../chat/ChatPane';

type Tab = 'activity' | 'tasks' | 'schedule' | 'qa' | 'notes' | 'channels';
const ago = (t: string) => { const s = (Date.now() - new Date(t).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

/** Teamspace: the team's collaboration hub around the chat (activity, tasks, schedule, Q&A, the EB notebook and team channels). */
export function TeamspacePage() {
  const { eventId, can } = useStaff();
  const admin = can('event.config');
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') as Tab) || 'activity');
  useEffect(() => { const u = new URL(window.location.href); u.searchParams.set('tab', tab); window.history.replaceState(null, '', u); }, [tab]);
  // Committees this person runs (a chair: their own), from the chat's EB channels.
  const chat = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/chat`), [eventId]);
  const committees: { id: string; label: string }[] = (chat.data?.team ?? []).filter((c: any) => c.key.startsWith('eb:')).map((c: any) => ({ id: c.key.slice(3), label: c.label.replace(/^EB · /, '') }));
  const [inCall, setInCall] = useState<CallTarget | null>(null);
  if (!eventId) return <Alert tone="info">Choose a conference first.</Alert>;
  const T = `/api/admin/events/${eventId}/teamspace`;
  const rooms: { key: string; label: string }[] = [...(chat.data?.team ?? []), ...(chat.data?.channels ?? [])].map((c: any) => ({ key: c.key, label: c.label }));
  const joinMeeting = (s: any) => setInCall({ key: `mt:${s.id}`, title: s.title, kind: 'video' });
  return (
    <div className="stack">
      <PageHead title="Teamspace" subtitle="Everything your team needs to run the conference together: what needs your attention, a task board, the schedule, delegates’ questions for the EB, and each committee’s EB notebook. Chat lives under Chat." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'activity', label: 'Activity' }, { key: 'tasks', label: 'Tasks' }, { key: 'schedule', label: 'Schedule' }, { key: 'qa', label: 'Ask the EB' }, { key: 'notes', label: 'EB notebook' },
        ...(admin ? [{ key: 'channels' as const, label: 'Team channels' }] : []),
      ]} />
      {tab === 'activity' && <ActivityTab T={T} go={setTab} onJoin={joinMeeting} />}
      {tab === 'tasks' && <Tasks T={T} committees={committees} />}
      {tab === 'schedule' && <ScheduleTab T={T} committees={committees} edit={admin} rooms={rooms} onJoin={joinMeeting} />}
      {inCall && <CallRoom key={inCall.key} base={`/api/admin/events/${eventId}/calls`} target={inCall} onClose={() => setInCall(null)} />}
      {tab === 'qa' && <QaTab T={T} committees={committees} />}
      {tab === 'notes' && (chat.data ? <Notebook T={T} committees={committees} /> : <Loading />)}
      {tab === 'channels' && admin && <Channels T={T} />}
    </div>
  );
}

// ---------- activity ----------
const ICON: Record<string, typeof Bell> = { mention: AtSign, reply: MessageSquareReply, announcement: Megaphone };
const VERB: Record<string, string> = { mention: 'mentioned you', reply: 'replied to you', announcement: 'posted an announcement' };
function ActivityTab({ T, go, onJoin }: { T: string; go: (t: Tab) => void; onJoin: (s: any) => void }) {
  const d = useAsync<any>(() => api.get(`${T}/activity`), [T]);
  useEffect(() => { const t = setInterval(d.reload, 20000); return () => clearInterval(t); }, [d]);
  if (!d.data) return <Loading />;
  const a = d.data;
  return (
    <div className="ts-staff-grid">
      <div className="card flush">
        <div className="card-head"><Bell className="icon" /><h3>Activity</h3></div>
        {!a.items.length ? <div className="ts-empty"><Bell size={26} /><b>All caught up</b><span>Mentions, replies to you and announcements show here.</span></div>
          : a.items.map((it: any) => { const I = ICON[it.type] ?? Bell; return (
            <a key={it.type + it.id} className={`ts-act ${it.type}`} href={`/app/chat`}>
              <span className="ts-act-ic"><I size={16} /></span>
              <span className="ts-act-t"><span><b>{it.sender_name}</b> {VERB[it.type]}</span>{it.title && <strong>{it.title}</strong>}<span className="ts-act-body">{formatText(it.body ?? '')}</span></span>
              <small>{ago(it.created_at)}</small>
            </a>); })}
      </div>
      <div className="stack">
        <div className="card stack tight">
          <div className="row between"><h3 style={{ margin: 0 }}><ClipboardList className="icon" /> Your tasks</h3><Btn size="sm" kind="ghost" onClick={() => go('tasks')}>Open board</Btn></div>
          {!a.tasks.length ? <p className="small muted" style={{ margin: 0 }}>Nothing assigned to you.</p> : a.tasks.map((t: any) => <div key={t.id} className="ts-mini"><span className={`ts-pri ${t.priority}`} />{t.title}{t.due_at && <small className={new Date(t.due_at) < new Date() ? 'late' : ''}>{new Date(t.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>}</div>)}
        </div>
        <div className="card stack tight">
          <div className="row between"><h3 style={{ margin: 0 }}><HelpCircle className="icon" /> Questions waiting</h3><Btn size="sm" kind="ghost" onClick={() => go('qa')}>Answer</Btn></div>
          {!a.questions.length ? <p className="small muted" style={{ margin: 0 }}>No questions waiting.</p> : a.questions.slice(0, 4).map((q: any) => <div key={q.id} className="ts-mini"><b>{q.committee}</b> {q.body}<small><ThumbsUp size={11} /> {q.votes}</small></div>)}
        </div>
        <div className="card stack tight">
          <div className="row between"><h3 style={{ margin: 0 }}><CalendarDays className="icon" /> Coming up</h3><Btn size="sm" kind="ghost" onClick={() => go('schedule')}>Schedule</Btn></div>
          {!a.upcoming.length ? <p className="small muted" style={{ margin: 0 }}>Nothing scheduled.</p> : a.upcoming.map((s: any) => <ScheduleRow key={s.id} s={s} compact actions={<JoinMeeting s={s} onJoin={onJoin} />} />)}
        </div>
      </div>
    </div>
  );
}

// ---------- tasks ----------
const COLS = [{ key: 'todo', label: 'To do' }, { key: 'doing', label: 'In progress' }, { key: 'done', label: 'Done' }] as const;
const PRI = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }];
function Tasks({ T, committees }: { T: string; committees: { id: string; label: string }[] }) {
  const { me } = useStaff();
  const list = useAsync<any[]>(() => api.get(`${T}/tasks`), [T]);
  const people = useAsync<any[]>(() => api.get(`${T}/people`), [T]);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [committee, setCommittee] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [quick, setQuick] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const toast = useToast();
  if (!list.data) return <Loading />;
  const shown = list.data.filter((t) => (filter === 'mine' ? t.assignee_id === me.user!.id : true) && (!committee || t.committee_id === committee));
  const move = async (t: any, status: string) => { try { await api.patch(`${T}/tasks/${t.id}`, { status }); list.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  const add = async () => { if (!quick.trim()) return; try { await api.post(`${T}/tasks`, { title: quick, committee_id: committee || (committees.length === 1 && me.roles.every((r) => r.role === 'chair') ? committees[0].id : null) }); setQuick(''); list.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <div className="row between">
        <div className="row"><Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All tasks' }, { value: 'mine', label: 'Assigned to me' }]} />
          {committees.length > 1 && <select value={committee} onChange={(e) => setCommittee(e.target.value)} aria-label="Committee" style={{ width: 'auto' }}><option value="">Every committee</option>{committees.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}</div>
        <Btn kind="primary" icon={Plus} onClick={() => setEdit({ title: '', status: 'todo', priority: 'normal', bucket: 'General', committee_id: committee || null, checklist: [] })}>New task</Btn>
      </div>
      <div className="ts-board">
        {COLS.map((c) => {
          const items = shown.filter((t) => t.status === c.key);
          return (
            <section key={c.key} className={`ts-col ${drag ? 'droppable' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => { const t = list.data!.find((x) => x.id === drag); setDrag(null); if (t && t.status !== c.key) move(t, c.key); }} aria-label={c.label}>
              <header><b>{c.label}</b><span>{items.length}</span></header>
              {c.key === 'todo' && <div className="ts-quick"><input value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="+ Add a task and press Enter" aria-label="Quick add a task" /></div>}
              {items.map((t) => {
                const done = t.checklist.filter((x: any) => x.done).length;
                const late = t.due_at && t.status !== 'done' && new Date(t.due_at) < new Date();
                const i = COLS.findIndex((x) => x.key === t.status);
                return (
                  <article key={t.id} className={`ts-card ${t.status}`} draggable onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)}>
                    <button type="button" className="ts-card-main" onClick={() => setEdit(t)}>
                      <div className="ts-card-tags">{t.priority !== 'normal' && <span className={`ts-chip ${t.priority}`}>{t.priority}</span>}<span className="ts-chip">{t.bucket}</span>{t.committee && <span className="ts-chip c">{t.committee}</span>}</div>
                      <b>{t.title}</b>
                      <div className="ts-card-foot">
                        {t.due_at && <small className={late ? 'late' : ''}><CalendarDays size={12} /> {new Date(t.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>}
                        {t.checklist.length > 0 && <small><CheckCircle2 size={12} /> {done}/{t.checklist.length}</small>}
                        <span className="spacer" />
                        {t.assignee && <span className="ts-who" title={t.assignee.name}>{initials(t.assignee.name)}</span>}
                      </div>
                    </button>
                    <div className="ts-card-move">
                      {i > 0 && <button type="button" onClick={() => move(t, COLS[i - 1].key)} aria-label={`Move to ${COLS[i - 1].label}`}><ArrowLeft size={13} /></button>}
                      {i < 2 && <button type="button" onClick={() => move(t, COLS[i + 1].key)} aria-label={`Move to ${COLS[i + 1].label}`}><ArrowRight size={13} /></button>}
                    </div>
                  </article>
                );
              })}
              {!items.length && c.key !== 'todo' && <div className="ts-col-empty">Drag tasks here</div>}
            </section>
          );
        })}
      </div>
      {edit && <TaskEditor T={T} task={edit} people={people.data ?? []} committees={committees} buckets={[...new Set(['General', 'Logistics', 'Committee prep', 'Press', 'IT', 'Finance', ...list.data.map((t) => t.bucket)])]} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} />}
    </div>
  );
}

function TaskEditor({ T, task, people, committees, buckets, onClose, onSaved }: { T: string; task: any; people: any[]; committees: { id: string; label: string }[]; buckets: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...task, due_at: toLocal(task.due_at), checklist: [...(task.checklist ?? [])] });
  const [item, setItem] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (p: any) => setF((x: any) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { title: f.title, notes: f.notes ?? '', status: f.status, priority: f.priority, bucket: f.bucket, committee_id: f.committee_id || null, assignee_id: f.assignee_id || null, due_at: fromLocal(f.due_at), checklist: f.checklist };
      if (task.id) await api.patch(`${T}/tasks/${task.id}`, body); else await api.post(`${T}/tasks`, body);
      toast(task.id ? 'Task saved' : 'Task added', 'ok'); onSaved();
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal wide title={task.id ? 'Task' : 'New task'} onClose={onClose} footer={<>
      {task.id && <Btn kind="danger" icon={Trash2} onClick={async () => { if (!confirm('Delete this task?')) return; try { await api.del(`${T}/tasks/${task.id}`); onSaved(); } catch (e: any) { toast(e.message, 'bad'); } }}>Delete</Btn>}
      <span className="spacer" /><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title.trim()} onClick={save}>Save</Btn></>}>
      <div className="stack">
        <Field label="Title"><input value={f.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} placeholder="Print placards for DISEC" autoFocus /></Field>
        <div className="grid g3">
          <Field label="Status"><select value={f.status} onChange={(e) => set({ status: e.target.value })}>{COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
          <Field label="Priority"><select value={f.priority} onChange={(e) => set({ priority: e.target.value })}>{PRI.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
          <Field label="Due"><input type="datetime-local" value={f.due_at} onChange={(e) => set({ due_at: e.target.value })} /></Field>
        </div>
        <div className="grid g3">
          <Field label="Assigned to"><select value={f.assignee_id ?? ''} onChange={(e) => set({ assignee_id: e.target.value })}><option value="">Nobody yet</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.committees.length ? ` (${p.committees.join(', ')})` : ''}</option>)}</select></Field>
          <Field label="Committee"><select value={f.committee_id ?? ''} onChange={(e) => set({ committee_id: e.target.value })}><option value="">Whole conference</option>{committees.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
          <Field label="Bucket"><input list="ts-buckets" value={f.bucket} maxLength={40} onChange={(e) => set({ bucket: e.target.value })} /><datalist id="ts-buckets">{buckets.map((b) => <option key={b} value={b} />)}</datalist></Field>
        </div>
        <Field label="Notes"><textarea rows={3} value={f.notes ?? ''} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <Field label={`Checklist${f.checklist.length ? ` (${f.checklist.filter((c: any) => c.done).length}/${f.checklist.length})` : ''}`}>
          <div className="stack tight">
            {f.checklist.map((c: any, i: number) => <div key={i} className="row ts-check"><input type="checkbox" checked={c.done} onChange={(e) => set({ checklist: f.checklist.map((x: any, k: number) => (k === i ? { ...x, done: e.target.checked } : x)) })} aria-label={`Done: ${c.text}`} /><span className={c.done ? 'done' : ''}>{c.text}</span><button type="button" className="ch-act" aria-label="Remove item" onClick={() => set({ checklist: f.checklist.filter((_: any, k: number) => k !== i) })}><Trash2 size={13} /></button></div>)}
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add an item and press Enter" aria-label="New checklist item" onKeyDown={(e) => { if (e.key === 'Enter' && item.trim()) { e.preventDefault(); set({ checklist: [...f.checklist, { text: item.trim(), done: false }] }); setItem(''); } }} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// ---------- schedule ----------
const KINDS = [['session', 'Committee session'], ['ceremony', 'Ceremony'], ['break', 'Break'], ['social', 'Social'], ['deadline', 'Deadline'], ['meeting', 'Team meeting']];
const AUD = [['all', 'Everyone'], ['delegates', 'Delegates only'], ['staff', 'The team only'], ['eb', 'That committee’s EB only']];
function ScheduleTab({ T, committees, edit, rooms, onJoin }: { T: string; committees: { id: string; label: string }[]; edit: boolean; rooms: { key: string; label: string }[]; onJoin: (s: any) => void }) {
  const list = useAsync<any[]>(() => api.get(`${T}/schedule`), [T]);
  const [item, setItem] = useState<any | null>(null);
  const toast = useToast();
  if (!list.data) return <Loading />;
  return (
    <div className="stack">
      <div className="row between"><p className="muted" style={{ margin: 0 }}>Delegates see items for everyone or delegates, for all committees or their own, in their Teamspace. The team sees everything.</p>
        {edit && <Btn kind="primary" icon={Plus} onClick={() => setItem({ title: '', kind: 'session', audience: 'all', committee_id: '', starts_at: '', ends_at: '', location: '', notes: '', call_channel: '' })}>Add to schedule</Btn>}</div>
      {!list.data.length ? <div className="card"><p className="muted" style={{ margin: 0 }}><CalendarDays className="icon" /> Nothing scheduled yet.{edit ? ' Add the opening ceremony and the committee sessions.' : ''}</p></div>
        : groupByDay(list.data).map((g) => <section key={g.day} className="card ts-day"><h3>{g.day}</h3>{g.items.map((s) => <ScheduleRow key={s.id} s={s} actions={<div className="row" style={{ gap: 4 }}>
          <JoinMeeting s={s} onJoin={onJoin} />
          {s.audience !== 'all' && <span className="badge">{AUD.find((a) => a[0] === s.audience)?.[1]}</span>}{s.going > 0 && <span className="badge info">{s.going} interested</span>}
          {edit && <Btn size="sm" kind="ghost" icon={Pencil} onClick={() => setItem({ ...s, starts_at: toLocal(s.starts_at), ends_at: toLocal(s.ends_at), committee_id: s.committee_id ?? '', call_channel: s.call_channel ?? '' })} title="Edit" />}
          {edit && <Btn size="sm" kind="ghost" icon={Trash2} onClick={async () => { if (!confirm(`Delete “${s.title}”?`)) return; await api.del(`${T}/schedule/${s.id}`); list.reload(); }} title="Delete" />}</div>} />)}</section>)}
      {item && <Modal title={item.id ? 'Edit schedule item' : 'Add to schedule'} onClose={() => setItem(null)} footer={<><Btn onClick={() => setItem(null)}>Cancel</Btn><Btn kind="primary" onClick={async () => {
        const body = { ...item, starts_at: fromLocal(item.starts_at), ends_at: fromLocal(item.ends_at), committee_id: item.committee_id || null, call_channel: item.call_channel || null };
        try { if (item.id) await api.patch(`${T}/schedule/${item.id}`, body); else await api.post(`${T}/schedule`, body); setItem(null); list.reload(); toast('Schedule saved', 'ok'); } catch (e: any) { toast(e.message, 'bad'); }
      }}>Save</Btn></>}>
        <div className="stack">
          <Field label="Title"><input value={item.title} maxLength={140} onChange={(e) => setItem({ ...item, title: e.target.value })} placeholder="Committee Session I" autoFocus /></Field>
          <div className="grid g2">
            <Field label="Kind"><select value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Who sees it"><select value={item.audience} onChange={(e) => setItem({ ...item, audience: e.target.value })}>{AUD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Starts"><input type="datetime-local" value={item.starts_at} onChange={(e) => setItem({ ...item, starts_at: e.target.value })} /></Field>
            <Field label="Ends (optional)"><input type="datetime-local" value={item.ends_at} onChange={(e) => setItem({ ...item, ends_at: e.target.value })} /></Field>
            <Field label="Committee"><select value={item.committee_id} onChange={(e) => setItem({ ...item, committee_id: e.target.value })}><option value="">All committees</option>{committees.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
            <Field label="Where"><input value={item.location} maxLength={120} onChange={(e) => setItem({ ...item, location: e.target.value })} placeholder="Main auditorium" /></Field>
          </div>
          <Field label="Online meeting (audio and video)" hint="People who can open this channel get a Join button from 15 minutes before. Up to 12 people with cameras.">
            <select value={item.call_channel} onChange={(e) => setItem({ ...item, call_channel: e.target.value })}><option value="">No online meeting</option>{rooms.map((r) => <option key={r.key} value={r.key}>{r.key === 'all' ? 'All delegates (All committees)' : r.label}</option>)}</select>
          </Field>
          <Field label="Notes"><textarea rows={2} value={item.notes} maxLength={1000} onChange={(e) => setItem({ ...item, notes: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}

// ---------- Ask the EB ----------
function QaTab({ T, committees }: { T: string; committees: { id: string; label: string }[] }) {
  const [committee, setCommittee] = useState('');
  const [filter, setFilter] = useState<'open' | 'answered' | 'hidden'>('open');
  const list = useAsync<any[]>(() => api.get(`${T}/questions${committee ? `?committee=${committee}` : ''}`), [T, committee]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const toast = useToast();
  useEffect(() => { const t = setInterval(list.reload, 15000); return () => clearInterval(t); }, [list]);
  if (!list.data) return <Loading />;
  const shown = list.data.filter((q) => (filter === 'hidden' ? q.hidden : !q.hidden && (filter === 'answered' ? !!q.answer : !q.answer)));
  const act = async (id: string, body: any, ok: string) => { try { await api.post(`${T}/questions/${id}`, body); toast(ok, 'ok'); list.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <div className="row">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'open', label: `Waiting (${list.data.filter((q) => !q.answer && !q.hidden).length})` }, { value: 'answered', label: 'Answered' }, { value: 'hidden', label: 'Hidden' }]} />
        {committees.length > 1 && <select value={committee} onChange={(e) => setCommittee(e.target.value)} aria-label="Committee" style={{ width: 'auto' }}><option value="">Every committee</option>{committees.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Delegates ask their own committee’s EB and upvote each other’s questions; the most wanted come first. You always see who asked, even when they hid their name from other delegates.</p>
      {!shown.length ? <div className="card"><p className="muted" style={{ margin: 0 }}><HelpCircle className="icon" /> No questions here.</p></div>
        : shown.map((q) => <div key={q.id} className="card ts-q staff">
          <div className="ts-vote static"><ThumbsUp size={14} /><b>{q.votes}</b></div>
          <div className="ts-q-t stack tight">
            <small><b>{q.committee}</b> · {q.asker}{q.anonymous ? ' (hidden from delegates)' : ''} · {ago(q.created_at)}</small>
            <p>{q.body}</p>
            {q.answer && <div className="ts-answer"><CheckCircle2 size={15} /><div><small>{q.answerer ?? 'EB'} answered</small><p>{q.answer}</p></div></div>}
            {!q.hidden && <textarea rows={2} value={drafts[q.id] ?? (q.answer ?? '')} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} placeholder="Write the EB’s answer…" aria-label="Answer" />}
            <div className="row">
              {!q.hidden && <Btn size="sm" kind="primary" onClick={() => act(q.id, { answer: drafts[q.id] ?? q.answer ?? '' }, 'Answer posted')}>{q.answer ? 'Update answer' : 'Answer'}</Btn>}
              <Btn size="sm" kind="ghost" icon={q.hidden ? Eye : EyeOff} onClick={() => act(q.id, { hidden: !q.hidden }, q.hidden ? 'Shown again' : 'Hidden from delegates')}>{q.hidden ? 'Show' : 'Hide'}</Btn>
            </div>
          </div>
        </div>)}
    </div>
  );
}

// ---------- EB notebook ----------
function Notebook({ T, committees }: { T: string; committees: { id: string; label: string }[] }) {
  const [committee, setCommittee] = useState(committees[0]?.id ?? '');
  const pages = useAsync<any[]>(() => (committee ? api.get(`${T}/notes/${committee}`) : Promise.resolve([])), [T, committee]);
  const [open, setOpen] = useState<any | null>(null);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  useEffect(() => { setOpen(null); }, [committee]);
  if (!committees.length) return <Alert tone="info">Add committees first; each committee’s EB gets its own notebook.</Alert>;
  const save = async () => {
    try { const r = await api.post<any>(`${T}/notes/${committee}`, { id: open.id, title: open.title, body: open.body, updated_at: open.updated_at }); setDirty(false); toast('Saved', 'ok'); const list = await api.get<any[]>(`${T}/notes/${committee}`); pages.reload(); setOpen(list.find((p) => p.id === r.id) ?? null); }
    catch (e: any) { toast(e.message, 'bad'); }
  };
  const TEMPLATES = [
    { title: 'Agenda and session plan', body: 'Agenda:\n\nSession I\n- Roll call\n- Setting the agenda\n- General Speakers’ List\n\nSession II\n- Moderated caucuses (topics below)\n' },
    { title: 'Moderated caucus topics', body: '1. \n2. \n3. \n\nTopics delegates proposed:\n' },
    { title: 'Awards shortlist', body: 'Best Delegate:\nHigh Commendation:\nSpecial Mention:\nVerbal Mention:\n\nNotes for the deliberation:\n' },
  ];
  return (
    <div className="ts-notebook">
      <aside className="card flush">
        <div className="card-head">{committees.length > 1 ? <select value={committee} onChange={(e) => setCommittee(e.target.value)} aria-label="Committee">{committees.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select> : <h3><NotebookPen className="icon" /> {committees[0].label}</h3>}</div>
        <div className="ts-pages">
          {(pages.data ?? []).map((p) => <button key={p.id} type="button" className={`ch-item ${open?.id === p.id ? 'on' : ''}`} onClick={() => { if (dirty && !confirm('Discard your unsaved changes?')) return; setDirty(false); setOpen(p); }}><NotebookPen size={15} /><span>{p.title}</span></button>)}
          <button type="button" className="ch-item" onClick={() => { setDirty(true); setOpen({ title: 'New page', body: '' }); }}><Plus size={15} /><span>New page</span></button>
          {!pages.data?.length && <div className="ts-tpl"><small>Start from:</small>{TEMPLATES.map((t) => <button key={t.title} type="button" className="ch-link" onClick={() => { setDirty(true); setOpen({ ...t }); }}>{t.title}</button>)}</div>}
        </div>
      </aside>
      <section className="card stack">
        {!open ? <div className="ts-empty"><NotebookPen size={28} /><b>The EB notebook</b><span>Shared pages for this committee’s EB: the session plan, caucus topics, notes on delegates and the awards shortlist. Only the EB and the secretariat can open it.</span></div> : <>
          <div className="row between"><input className="ts-note-title" value={open.title} maxLength={120} onChange={(e) => { setOpen({ ...open, title: e.target.value }); setDirty(true); }} aria-label="Page title" />
            <div className="row">{open.id && <Btn size="sm" kind="ghost" icon={Trash2} onClick={async () => { if (!confirm('Delete this page?')) return; await api.del(`${T}/notes/${committee}/${open.id}`); setOpen(null); setDirty(false); pages.reload(); }} title="Delete page" />}<Btn kind="primary" icon={Save} disabled={!dirty} onClick={save}>Save</Btn></div></div>
          {open.updated_by && <small className="muted">Last saved by {open.updated_by}, {ago(open.updated_at)}</small>}
          <textarea className="ts-note-body" value={open.body} onChange={(e) => { setOpen({ ...open, body: e.target.value }); setDirty(true); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } }} aria-label="Page text" />
        </>}
      </section>
    </div>
  );
}

// ---------- team channels ----------
function Channels({ T }: { T: string }) {
  const list = useAsync<any[]>(() => api.get(`${T}/channels`), [T]);
  const people = useAsync<any[]>(() => api.get(`${T}/people`), [T]);
  const [edit, setEdit] = useState<any | null>(null);
  const toast = useToast();
  const suggestions = ['Logistics', 'Press & media', 'IT & tech', 'Hospitality', 'Crisis team', 'Finance'];
  const memberSet = useMemo(() => new Set<string>(edit?.members ?? []), [edit]);
  if (!list.data) return <Loading />;
  return (
    <div className="stack">
      <div className="row between"><p className="muted" style={{ margin: 0 }}>Channels for parts of your team. Only the people you add (and organisers) can open them. Everyone already has <b>Whole team</b> and each committee has a private <b>EB</b> channel.</p>
        <Btn kind="primary" icon={Plus} onClick={() => setEdit({ name: '', description: '', members: [] })}>New channel</Btn></div>
      {!list.data.length ? <div className="card stack tight"><p className="muted" style={{ margin: 0 }}><Briefcase className="icon" /> No team channels yet. Common ones:</p><div className="row">{suggestions.map((s) => <Btn key={s} size="sm" icon={Plus} onClick={() => setEdit({ name: s, description: '', members: [] })}>{s}</Btn>)}</div></div>
        : <div className="grid g2">{list.data.map((c) => <div key={c.id} className="card stack tight">
          <div className="row between"><h3 style={{ margin: 0 }}><Briefcase className="icon" /> {c.name}</h3><div className="row" style={{ gap: 4 }}><Btn size="sm" icon={Pencil} onClick={() => setEdit({ ...c, members: c.members.map((m: any) => m.id) })}>Edit</Btn><Btn size="sm" kind="ghost" icon={Archive} title="Archive" onClick={async () => { if (!confirm(`Archive #${c.name}? Its messages are kept but nobody can open it.`)) return; await api.patch(`${T}/channels/${c.id}`, { archived: true }); list.reload(); }} /></div></div>
          {c.description && <p className="small muted" style={{ margin: 0 }}>{c.description}</p>}
          <div className="ts-avatars">{c.members.map((m: any) => <span key={m.id} className="ts-who" title={m.name}>{initials(m.name)}</span>)}<small className="muted">{c.members.length} member{c.members.length === 1 ? '' : 's'}</small></div>
        </div>)}</div>}
      {edit && <Modal title={edit.id ? `Edit #${edit.name}` : 'New team channel'} onClose={() => setEdit(null)} footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn kind="primary" onClick={async () => {
        try { if (edit.id) await api.patch(`${T}/channels/${edit.id}`, { name: edit.name, description: edit.description, members: edit.members }); else await api.post(`${T}/channels`, edit); setEdit(null); list.reload(); toast('Channel saved', 'ok'); } catch (e: any) { toast(e.message, 'bad'); }
      }}>Save</Btn></>}>
        <div className="stack">
          <Field label="Name"><input value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Logistics" autoFocus /></Field>
          <Field label="What it’s for (optional)"><input value={edit.description} maxLength={200} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Venue, transport, food and placards" /></Field>
          <Field label={`Members (${memberSet.size})`}>
            <div className="ts-people">{(people.data ?? []).map((p) => <label key={p.id} className="check"><input type="checkbox" checked={memberSet.has(p.id)} onChange={(e) => setEdit({ ...edit, members: e.target.checked ? [...edit.members, p.id] : edit.members.filter((x: string) => x !== p.id) })} /><span><b>{p.name}</b> <small className="muted">{p.roles.join(', ')}{p.committees.length ? ` · ${p.committees.join(', ')}` : ''}</small></span></label>)}</div>
          </Field>
        </div>
      </Modal>}
      <p className="small muted"><Users className="icon" /> Tip: open a channel from <a href="/app/chat">Chat</a>.</p>
    </div>
  );
}
