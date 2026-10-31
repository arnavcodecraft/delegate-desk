import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Film, Link2, Pencil, Plus, Power, Trash2, Upload, Users, Wrench, Building2, Radio, Mailbox, Clapperboard, ExternalLink, Timer } from 'lucide-react';
import { api, ApiError } from '../api';
import { nativeApp } from '../native';
import { Alert, Btn, Field, Loading, Switch, Tabs, Tile, useAsync, useToast } from '../ui';
import { PageHead } from './Shell';
import { refreshSite } from '../site';
import { embedUrl, fmt, LecturePlayer, type Lecture } from '../prep/Videos';

type Tab = 'overview' | 'features' | 'videos';
interface OwnerSite {
  features: Record<string, boolean>;
  labels: Record<string, { label: string; help: string; area: string }>;
  maintenance: { on: boolean; message: string; until: string | null };
  numbers: { organisers: number; listed: number; people: number; sessions: number; lectures: number; inbox: number };
}

/** The site owner's console: what is switched on, maintenance mode, and the tutor video lectures. */
export function OwnerConsole() {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') as Tab) || 'overview');
  const site = useAsync<OwnerSite>(() => api.get('/api/owner/site'), []);
  useEffect(() => { const u = new URL(window.location.href); u.searchParams.set('tab', tab); window.history.replaceState(null, '', u); }, [tab]);
  return (
    <div className="stack">
      <PageHead title="Site owner" subtitle="Run DelegateDesk itself: switch parts of the site on and off, put the site into maintenance, and manage the tutor video lectures. Only the DelegateDesk team sees this." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'features', label: 'Features' }, { key: 'videos', label: 'Videos' }]} />
      {site.error ? <Alert tone="bad">{site.error.message}</Alert> : !site.data ? <Loading /> : tab === 'overview' ? <Overview s={site.data} reload={site.reload} />
        : tab === 'features' ? <Features s={site.data} reload={site.reload} /> : <Videos />}
    </div>
  );
}

// ---------- overview + maintenance ----------
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function Overview({ s, reload }: { s: OwnerSite; reload: () => void }) {
  const n = s.numbers;
  const off = Object.entries(s.features).filter(([, v]) => !v).map(([k]) => s.labels[k]?.label ?? k);
  return (
    <>
      <div className="grid g3">
        <Tile label="Organisers" value={n.organisers} sub={`${n.listed} conference${n.listed === 1 ? '' : 's'} listed`} icon={Building2} />
        <Tile label="Delegate accounts" value={n.people} icon={Users} />
        <Tile label="Live sessions now" value={n.sessions} icon={Radio} />
        <Tile label="Video lectures" value={n.lectures} icon={Clapperboard} />
        <Tile label="New in the inbox" value={n.inbox} icon={Mailbox} />
        <Tile label="Features switched off" value={off.length} sub={off.length ? off.join(', ') : 'Everything is on'} icon={Power} tone={off.length ? 'neg' : undefined} />
      </div>
      <Maintenance m={s.maintenance} reload={reload} />
    </>
  );
}

function Maintenance({ m, reload }: { m: OwnerSite['maintenance']; reload: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState(m.message);
  const [until, setUntil] = useState(toLocal(m.until));
  const [busy, setBusy] = useState(false);
  const save = async (on: boolean) => {
    setBusy(true);
    try {
      await api.patch('/api/owner/maintenance', { on, message, until: until ? new Date(until).toISOString() : null });
      toast(on ? 'Maintenance mode is on. Visitors now see the maintenance page.' : m.on ? 'Maintenance mode is off. The site is open again.' : 'Saved', 'ok');
      refreshSite(); reload();
    } catch (e) { toast((e as Error).message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className={`card stack own-maint ${m.on ? 'on' : ''}`}>
      <div className="row between">
        <div className="row"><span className="own-ic"><Wrench className="icon" /></span><div><h3 style={{ margin: 0 }}>Maintenance mode</h3><p className="small muted" style={{ margin: 0 }}>Visitors see a maintenance page and the server refuses changes. You (and staff signing in) can still get in.</p></div></div>
        <span className={`badge ${m.on ? 'warn' : 'good'}`}>{m.on ? 'Site is in maintenance' : 'Site is live'}</span>
      </div>
      <div className="grid g2">
        <Field label="Message for visitors" hint="Leave empty for the standard message."><textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="We are upgrading DelegateDesk. Back in about an hour." /></Field>
        <Field label="Expected back by (optional)" hint="Shown on the maintenance page."><input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
      </div>
      <div className="row">
        {m.on ? <Btn kind="good" icon={Power} disabled={busy} onClick={() => save(false)}>Turn maintenance off</Btn>
          : <Btn kind="danger" icon={Wrench} disabled={busy} onClick={() => { if (window.confirm('Put the whole site into maintenance? Visitors will not be able to use it until you turn this off.')) save(true); }}>Turn maintenance on</Btn>}
        <Btn disabled={busy} onClick={() => save(m.on)}>Save message</Btn>
      </div>
    </div>
  );
}

// ---------- features ----------
function Features({ s, reload }: { s: OwnerSite; reload: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(s.features);
  const areas = [...new Set(Object.values(s.labels).map((l) => l.area))];
  const flip = async (k: string, v: boolean) => {
    setF((x) => ({ ...x, [k]: v }));
    try { await api.patch('/api/owner/features', { [k]: v }); toast(`${s.labels[k].label} ${v ? 'switched on' : 'switched off'}`, 'ok'); refreshSite(); reload(); }
    catch (e) { setF((x) => ({ ...x, [k]: !v })); toast((e as Error).message, 'bad'); }
  };
  return (
    <>
      <Alert tone="info">Switching something off hides it from the menus, shows visitors a short notice on its pages, and the server refuses its requests. You still see everything, so you can check it before switching it back on. Nothing is deleted.</Alert>
      <div className="grid g2">
        {areas.map((a) => (
          <div key={a} className="card own-feats">
            <h3>{a}</h3>
            {Object.entries(s.labels).filter(([, l]) => l.area === a).map(([k, l]) => (
              <div key={k} className={`own-feat ${f[k] ? '' : 'off'}`}>
                <div><b>{l.label}</b><small>{l.help}</small></div>
                <Switch checked={f[k]} onChange={(v) => flip(k, v)} label={<span className="sr-only">{l.label}</span>} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- videos ----------
function Videos() {
  const list = useAsync<{ lectures: Lecture[] }>(() => api.get('/api/owner/lectures'), []);
  const [edit, setEdit] = useState<Lecture | 'new' | null>(null);
  const toast = useToast();
  if (edit) return <Editor lec={edit === 'new' ? null : edit} done={(l) => { setEdit(l ?? null); list.reload(); }} />;
  if (!list.data) return <Loading />;
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok, 'ok'); list.reload(); } catch (e) { toast((e as Error).message, 'bad'); } };
  const ls = list.data.lectures;
  return (
    <div className="stack">
      <div className="row between">
        <p className="muted" style={{ margin: 0 }}>{ls.length} lecture{ls.length === 1 ? '' : 's'} · {ls.filter((l) => l.published).length} published. They show on <a href="/prep/videos" target="_blank" rel="noreferrer">Prep → Video lectures <ExternalLink className="icon" style={{ width: 13, height: 13, verticalAlign: -2 }} /></a> in this order.</p>
        <Btn kind="primary" icon={Plus} onClick={() => setEdit('new')}>Add a lecture</Btn>
      </div>
      {!ls.length ? <div className="card"><p className="muted" style={{ margin: 0 }}><Film className="icon" /> No lectures yet. Add the first one.</p></div>
        : <div className="card flush own-lecs">{ls.map((l, i) => (
          <div key={l.id} className="own-lec">
            <span className="own-thumb" style={{ ['--a' as any]: l.tutor.accent }}>{l.poster ? <img src={l.poster} alt="" /> : embedUrl(l.video) ? <Link2 className="icon" /> : <span>{l.tutor.initials}</span>}</span>
            <div className="own-lec-t">
              <b>{l.title}</b>
              <small><i style={{ background: l.tutor.accent }} />{l.tutor.name}{l.tutor.role ? ` · ${l.tutor.role}` : ''} · {l.level}{l.duration ? ` · ${fmt(l.duration)}` : ''}</small>
            </div>
            <span className={`badge ${l.published ? 'good' : ''}`}>{l.published ? 'Published' : 'Draft'}</span>
            {!l.video && <span className="badge warn">No video</span>}
            <div className="row own-lec-act">
              <Btn size="sm" kind="ghost" title="Move up" disabled={i === 0} icon={ArrowUp} onClick={() => act(() => api.post(`/api/owner/lectures/${l.id}/move`, { dir: -1 }), 'Moved up')} />
              <Btn size="sm" kind="ghost" title="Move down" disabled={i === ls.length - 1} icon={ArrowDown} onClick={() => act(() => api.post(`/api/owner/lectures/${l.id}/move`, { dir: 1 }), 'Moved down')} />
              <Btn size="sm" kind="ghost" title={l.published ? 'Unpublish' : 'Publish'} icon={l.published ? EyeOff : Eye} onClick={() => act(() => api.patch(`/api/owner/lectures/${l.id}`, { published: !l.published }), l.published ? 'Unpublished: hidden from delegates' : 'Published')} />
              <Btn size="sm" icon={Pencil} onClick={() => setEdit(l)}>Edit</Btn>
              <Btn size="sm" kind="danger" title="Delete" icon={Trash2} onClick={() => { if (window.confirm(`Delete “${l.title}”? Files uploaded for it are deleted too.`)) act(() => api.del(`/api/owner/lectures/${l.id}`), 'Lecture deleted'); }} />
            </div>
          </div>))}</div>}
    </div>
  );
}

const parseTime = (s: string) => { const p = s.trim().split(':').map((x) => Number(x)); if (p.some((x) => isNaN(x))) return 0; return p.reduce((a, b) => a * 60 + b, 0); };
const ACCENTS = ['#1f4fe0', '#0f8a5f', '#a77bff', '#c2650a', '#c0262d', '#0e7490'];
const blank = { title: '', level: 'Beginner', summary: '', tutor: { name: '', role: '', initials: '', accent: ACCENTS[0] }, video: '', videoAlt: '', poster: '', captions: '', chapters: [] as { title: string; at: number }[], transcript: '', duration: null as number | null, published: false };

/** Send one file with progress (the API client cannot report progress; videos can be big). */
function upload(id: string, kind: string, file: File, onProgress: (p: number) => void): Promise<string> {
  if (nativeApp) { const fd = new FormData(); fd.append('file', file); return api.post<{ url: string }>(`/api/owner/lectures/${id}/file?kind=${kind}`, fd).then((r) => r.url); }
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/owner/lectures/${id}/file?kind=${kind}`);
    x.withCredentials = true;
    x.setRequestHeader('x-dd', '1');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let d: any = null; try { d = JSON.parse(x.responseText); } catch { /* not JSON */ } x.status < 300 && d?.url ? resolve(d.url) : reject(new ApiError(x.status, d?.error ?? `Upload failed (${x.status})`)); };
    x.onerror = () => reject(new ApiError(0, 'The upload stopped. Check your connection and try again.'));
    const fd = new FormData(); fd.append('file', file); x.send(fd);
  });
}

function Editor({ lec, done }: { lec: Lecture | null; done: (l?: Lecture) => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => (lec ? { ...blank, ...lec, tutor: { ...lec.tutor }, chapters: lec.chapters.map((c) => ({ ...c })), published: !!lec.published } : { ...blank, tutor: { ...blank.tutor } }));
  const [id, setId] = useState(lec?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [source, setSource] = useState<'file' | 'link'>(lec?.video && /^https:/.test(lec.video) ? 'link' : 'file');
  const preview = useRef<HTMLVideoElement>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const setTutor = (p: Partial<typeof f.tutor>) => setF((x) => ({ ...x, tutor: { ...x.tutor, ...p } }));
  const body = () => ({ ...f, tutor: { name: f.tutor.name, role: f.tutor.role, initials: f.tutor.initials, accent: f.tutor.accent } });

  const save = async (close: boolean) => {
    setBusy(true);
    try {
      const l = id ? await api.patch<Lecture>(`/api/owner/lectures/${id}`, body()) : await api.post<Lecture>('/api/owner/lectures', body());
      setId(l.id);
      toast(id ? 'Lecture saved' : 'Lecture created. You can upload its files now.', 'ok');
      if (close) done(); return l;
    } catch (e) { toast((e as Error).message, 'bad'); return null; } finally { setBusy(false); }
  };
  const pick = async (kind: 'video' | 'poster' | 'captions', file?: File | null) => {
    if (!file) return;
    let lid = id;
    if (!lid) { const l = await save(false); if (!l) return; lid = l.id; }
    setProgress((p) => ({ ...p, [kind]: 0 }));
    try {
      const url = await upload(lid, kind, file, (v) => setProgress((p) => ({ ...p, [kind]: v })));
      const patch = kind === 'video' ? { video: url, videoAlt: '' } : { [kind]: url };
      const saved = await api.patch<Lecture>(`/api/owner/lectures/${lid}`, patch);
      set({ video: saved.video, videoAlt: saved.videoAlt, poster: saved.poster, captions: saved.captions });
      toast(kind === 'video' ? 'Video uploaded' : kind === 'poster' ? 'Poster uploaded' : 'Captions uploaded', 'ok');
    } catch (e) { toast((e as Error).message, 'bad'); }
    finally { setProgress((p) => { const { [kind]: _, ...rest } = p; return rest; }); }
  };
  const ch = f.chapters;
  const setCh = (i: number, p: Partial<{ title: string; at: number }>) => set({ chapters: ch.map((c, k) => (k === i ? { ...c, ...p } : c)) });
  const previewLec: Lecture = { id: id || 'new', ...f, tutor: { ...f.tutor, initials: f.tutor.initials || f.tutor.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() } };
  const isEmbed = !!embedUrl(f.video);

  return (
    <div className="stack own-edit">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{lec ? 'Edit lecture' : 'New lecture'}</h2>
        <div className="row"><Btn onClick={() => done()}>Back to the list</Btn><Btn kind="primary" disabled={busy || !!Object.keys(progress).length} onClick={() => save(true)}>Save</Btn></div>
      </div>
      <div className="own-edit-grid">
        <div className="stack">
          <div className="card stack">
            <h3>About the lecture</h3>
            <Field label="Title"><input value={f.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} placeholder="Rules of procedure in ten minutes" /></Field>
            <div className="grid g2">
              <Field label="Level"><select value={f.level} onChange={(e) => set({ level: e.target.value })}>{['Beginner', 'Intermediate', 'Advanced', 'All levels'].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Shown to delegates"><Switch checked={f.published} onChange={(v) => set({ published: v })} label={f.published ? 'Published' : 'Draft (hidden)'} /></Field>
            </div>
            <Field label="Summary" hint="One or two sentences under the video."><textarea rows={3} maxLength={600} value={f.summary} onChange={(e) => set({ summary: e.target.value })} /></Field>
          </div>
          <div className="card stack">
            <h3>Tutor</h3>
            <div className="grid g2">
              <Field label="Name"><input value={f.tutor.name} maxLength={80} onChange={(e) => setTutor({ name: e.target.value })} placeholder="Meera Iyer" /></Field>
              <Field label="Role or credentials"><input value={f.tutor.role} maxLength={120} onChange={(e) => setTutor({ role: e.target.value })} placeholder="Head chair, 40+ conferences" /></Field>
            </div>
            <Field label="Colour">
              <div className="row own-swatches">{ACCENTS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.tutor.accent === c} className={f.tutor.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => setTutor({ accent: c })} />)}
                <span className="vl-av own-av" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${f.tutor.accent} 55%, #fff), ${f.tutor.accent})` }}>{previewLec.tutor.initials || '?'}</span></div>
            </Field>
          </div>
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}><Timer className="icon" /> Chapters</h3><Btn size="sm" icon={Plus} onClick={() => set({ chapters: [...ch, { title: '', at: Math.floor(preview.current?.currentTime ?? (ch.at(-1)?.at ?? 0)) }] })}>Add chapter</Btn></div>
            {!ch.length ? <p className="small muted" style={{ margin: 0 }}>Chapters let delegates jump to a part of the video. Play the preview to where a part starts, then press Add chapter.</p>
              : ch.map((c, i) => (
                <div key={i} className="own-ch">
                  <input className="own-ch-t" aria-label="Starts at (m:ss)" defaultValue={fmt(c.at)} key={`${i}-${c.at}`} onBlur={(e) => setCh(i, { at: parseTime(e.target.value) })} disabled={isEmbed} />
                  <input aria-label="Chapter title" value={c.title} maxLength={120} placeholder="Chapter title" onChange={(e) => setCh(i, { title: e.target.value })} />
                  {!isEmbed && <Btn size="sm" kind="ghost" title="Jump the preview here" onClick={() => { if (preview.current) preview.current.currentTime = c.at; }}>Go</Btn>}
                  {!isEmbed && <Btn size="sm" kind="ghost" title="Start this chapter at the preview's time" onClick={() => setCh(i, { at: Math.floor(preview.current?.currentTime ?? c.at) })}>Now</Btn>}
                  <Btn size="sm" kind="ghost" title="Remove" icon={Trash2} onClick={() => set({ chapters: ch.filter((_, k) => k !== i) })} />
                </div>))}
            {isEmbed && ch.length > 0 && <p className="small muted" style={{ margin: 0 }}>YouTube and Vimeo videos show the chapter list without times.</p>}
          </div>
          <div className="card stack">
            <h3>Transcript</h3>
            <Field label="Full text" hint="Separate parts with an empty line. A part whose first line is a chapter title is highlighted while that chapter plays."><textarea rows={10} value={f.transcript} onChange={(e) => set({ transcript: e.target.value })} /></Field>
          </div>
        </div>

        <div className="stack own-edit-side">
          <div className="card stack">
            <h3>Video</h3>
            <div className="vl-player own-preview"><LecturePlayer lec={previewLec} videoRef={preview} /></div>
            {!isEmbed && f.video && <video src={f.video} preload="metadata" hidden onLoadedMetadata={(e) => { const d = Math.round(e.currentTarget.duration); if (d && d !== f.duration) set({ duration: d }); }} />}
            <div className="segmented" role="radiogroup">
              <button type="button" role="radio" aria-checked={source === 'file'} className={source === 'file' ? 'on' : ''} onClick={() => setSource('file')}><Upload className="icon" /> Upload a file</button>
              <button type="button" role="radio" aria-checked={source === 'link'} className={source === 'link' ? 'on' : ''} onClick={() => setSource('link')}><Link2 className="icon" /> Use a link</button>
            </div>
            {source === 'file' ? <FilePick label="Video file" hint="MP4 (H.264) plays everywhere; WebM also works. Up to 500 MB." accept="video/mp4,video/webm" progress={progress.video} current={f.video && !/^https:/.test(f.video) ? f.video : ''} onPick={(file) => pick('video', file)} />
              : <Field label="Video link" hint="A YouTube or Vimeo link, or an https:// link to an MP4 or WebM file."><input value={f.video} onChange={(e) => set({ video: e.target.value.trim(), videoAlt: '' })} placeholder="https://www.youtube.com/watch?v=…" /></Field>}
            {f.duration ? <p className="small muted" style={{ margin: 0 }}>Length: {fmt(f.duration)}</p> : null}
          </div>
          {!isEmbed && <div className="card stack">
            <h3>Poster and captions</h3>
            <FilePick label="Poster image" hint="Shown before the video plays and in the list. JPG, PNG or WebP, 16:9." accept="image/jpeg,image/png,image/webp" progress={progress.poster} current={f.poster} image onPick={(file) => pick('poster', file)} onClear={() => set({ poster: '' })} />
            <FilePick label="Captions" hint="A WebVTT (.vtt) file. Captions help everyone, and are needed by delegates who are deaf or hard of hearing." accept=".vtt,text/vtt" progress={progress.captions} current={f.captions} onPick={(file) => pick('captions', file)} onClear={() => set({ captions: '' })} />
          </div>}
          {!id && <Alert tone="info">Uploading a file saves the lecture first, so give it a title and the tutor's name.</Alert>}
        </div>
      </div>
    </div>
  );
}

function FilePick({ label, hint, accept, progress, current, image, onPick, onClear }: { label: string; hint: string; accept: string; progress?: number; current: string; image?: boolean; onPick: (f: File) => void; onClear?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label={label} hint={hint}>
      <div className="own-file">
        {image && current && <img src={current} alt="" />}
        <div className="own-file-t">{progress !== undefined ? <><div className="own-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div><small>Uploading… {Math.round(progress * 100)}%</small></>
          : current ? <small className="mono">{current.split('/').pop()}</small> : <small className="muted">Nothing added</small>}</div>
        <input ref={input} type="file" accept={accept} hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onPick(file); }} />
        <Btn size="sm" icon={Upload} disabled={progress !== undefined} onClick={() => input.current?.click()}>{current ? 'Replace' : 'Choose file'}</Btn>
        {current && onClear && progress === undefined && <Btn size="sm" kind="ghost" onClick={onClear}>Remove</Btn>}
      </div>
    </Field>
  );
}
