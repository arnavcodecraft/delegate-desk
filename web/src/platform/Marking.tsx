import { useEffect, useMemo, useState } from 'react';
import { Award, ClipboardList, Download, FileSpreadsheet, Mic, MessageSquareText, Plus, ScrollText, Settings2, Trash2, UserCheck, X } from 'lucide-react';
import { Flag } from './art';

/** EB marking for the chair console: live marks, the marksheet, verbatim, recognition and the scheme. */
type Run = (a: any) => Promise<void>;
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const SOURCES: [string, string][] = [['speeches', 'Speeches'], ['pois', 'Verbal POIs'], ['chits_substantive', 'Substantive chits'], ['chits_poi', 'POI chits'], ['manual', 'Marked by hand']];

/** A score box that saves when you leave it (or press Enter). */
function ScoreInput({ value, max, onSave, label, wide }: { value: number | null | undefined; max: number; onSave: (v: number | null) => void; label: string; wide?: boolean }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => { const n = num(String(v)); if (n !== (value ?? null)) onSave(n); };
  return <input className="mk-score" style={wide ? { width: 84 } : undefined} type="number" step="0.05" min={0} max={max} value={v} aria-label={label} title={`${label} (out of ${max})`} placeholder={`/${max}`}
    onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}
/** Verbatim notes that autosave a moment after typing stops. */
function Notes({ value, onSave, placeholder, rows = 3 }: { value: string; onSave: (v: string) => void; placeholder: string; rows?: number }) {
  const [v, setV] = useState(value);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setV(value); }, [value, dirty]);
  useEffect(() => { if (!dirty) return; const t = setTimeout(() => { onSave(v); setDirty(false); }, 700); return () => clearTimeout(t); }, [v, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  return <textarea className="mk-notes" rows={rows} value={v} placeholder={placeholder} onChange={(e) => { setV(e.target.value); setDirty(true); }} onBlur={() => { if (dirty) { onSave(v); setDirty(false); } }} />;
}

function DelegatePick({ s, value, onChange, label, presentOnly }: { s: any; value: string; onChange: (v: string) => void; label: string; presentOnly?: boolean }) {
  return <select className="pf-input mk-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
    <option value="">{label}…</option>
    {s.delegates.filter((d: any) => !presentOnly || d.presence !== 'absent').map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
  </select>;
}

export function MarkingOff({ run, presets }: { run: Run; presets: { key: string; label: string }[] }) {
  const [preset, setPreset] = useState('verbatim_chits');
  return (
    <div className="pf-card pad mk-off">
      <span className="mk-icon"><ClipboardList className="icon" /></span>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div className="pf-h2" style={{ fontSize: 20 }}>Executive Board marking</div>
        <p className="pf-muted" style={{ margin: '6px 0 12px' }}>Mark every speech, POI and chit as the committee runs. The GSL and each moderated caucus become marksheet columns on their own; you keep verbatim notes, see who has been recognised, and get totals, ranks and awards. Marks are only visible on this console.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="pf-input mk-select" style={{ maxWidth: 440 }} value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Marking scheme">{presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
          <button className="pf-btn primary sm" onClick={() => run({ type: 'eb_enable', preset })}><ClipboardList className="icon" />Start marking</button>
        </div>
      </div>
    </div>
  );
}

/** Compact panel under the timer: mark whoever has the floor, add POIs, recognise in caucuses. */
export function FloorMarking({ s, run }: { s: any; run: Run }) {
  const m = s.marking;
  const [poiBy, setPoiBy] = useState('');
  const [rec, setRec] = useState('');
  const seg = m.segments.find((x: any) => x.id === m.currentSegment);
  const speech = [...m.speeches].reverse().find((x: any) => x.delegateId === s.speakers.current && x.segmentId === m.currentSegment);
  const name = (id: string | null) => s.delegates.find((d: any) => d.id === id)?.name ?? '—';
  return (
    <div className="pf-card pad mk-floor">
      <div className="mk-row"><b style={{ flex: 1 }}><Mic className="icon" style={{ width: 16, height: 16, verticalAlign: -3 }} /> EB marking · {seg ? `${seg.label}${seg.topic ? `: ${seg.topic}` : ''}` : 'no segment yet'}</b><span className="pf-tag">Day {m.day}</span></div>
      {s.mode === 'moderated' || seg?.kind === 'mod' ? (
        <div className="mk-row"><DelegatePick s={s} value={rec} onChange={setRec} label="Recognise a delegation" presentOnly /><button className="pf-btn primary sm" disabled={!rec} onClick={() => { run({ type: 'eb_recognise', delegateId: rec }); setRec(''); }}><UserCheck className="icon" />Recognise</button></div>
      ) : null}
      {speech ? (
        <div className="mk-speech">
          <div className="mk-row"><b style={{ flex: 1 }}>{name(speech.delegateId)}</b><ScoreInput value={speech.score} max={m.scheme.speechMax} label="Speech mark" wide onSave={(v) => run({ type: 'eb_speech', speechId: speech.id, score: v })} /></div>
          <Notes value={speech.notes} placeholder="Verbatim: key points as they speak…" onSave={(v) => run({ type: 'eb_speech', speechId: speech.id, notes: v })} />
          <label className="pf-check pf-small"><input type="checkbox" checked={speech.offline} onChange={(e) => run({ type: 'eb_speech', speechId: speech.id, offline: e.target.checked })} />Noted offline</label>
        </div>
      ) : <div className="pf-small pf-muted">{s.speakers.current ? 'Press Next speaker or Recognise to start marking this speech.' : 'When someone has the floor, mark the speech here.'}</div>}
      <div className="mk-row"><DelegatePick s={s} value={poiBy} onChange={setPoiBy} label="POI asked by" presentOnly /><button className="pf-btn ghost sm" disabled={!poiBy} onClick={() => { run({ type: 'eb_poi', by: poiBy, to: s.speakers.current }); setPoiBy(''); }}><Plus className="icon" />POI</button></div>
    </div>
  );
}

export function MarkingBoard({ s, run, code, chairKey }: { s: any; run: Run; code: string; chairKey: string }) {
  const [tab, setTab] = useState<'mark' | 'sheet' | 'verbatim' | 'recognition' | 'scheme'>('mark');
  const download = async () => {
    const r = await fetch(`/api/live/${code}/marksheet.xlsx`, { headers: { 'x-chair-key': chairKey } });
    if (!r.ok) return alert((await r.json().catch(() => ({}))).error ?? 'Could not export');
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = `${s.committee.short || s.committee.name} marksheet.xlsx`; a.click(); URL.revokeObjectURL(url);
  };
  const tabs: [typeof tab, string, any][] = [['mark', 'Mark', Mic], ['sheet', 'Marksheet', FileSpreadsheet], ['verbatim', 'Verbatim', ScrollText], ['recognition', 'Recognition', MessageSquareText], ['scheme', 'Scheme', Settings2]];
  return (
    <div className="mk">
      <div className="mk-tabs" role="tablist">
        {tabs.map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I className="icon" />{l}</button>)}
        <span style={{ flex: 1 }} />
        <label className="pf-small mk-day">Day <select value={s.marking.day} onChange={(e) => run({ type: 'eb_day', day: Number(e.target.value) })} aria-label="Conference day">{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select></label>
        {s.linked && <button className="pf-btn ghost sm" title="Sets each delegate's award so certificates print it" onClick={async () => {
          if (!confirm('Give these awards to the delegates holding the portfolios? Certificates will print them.')) return;
          const r = await fetch(`/api/admin/live/${code}/awards`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dd': '1' } });
          const d = await r.json().catch(() => ({}));
          alert(r.ok ? (d.given.length ? `Awards saved: ${d.given.map((g: any) => `${g.award} – ${g.portfolio}`).join(', ')}` : 'No awards yet: give marks first.') : d.error ?? 'Sign in to your organiser account on this device to send awards.');
        }}><Award className="icon" />Send awards to certificates</button>}
        <button className="pf-btn ghost sm" onClick={download}><Download className="icon" />Export Excel</button>
      </div>
      {tab === 'mark' && <LiveMarks s={s} run={run} />}
      {tab === 'sheet' && <Sheet s={s} run={run} />}
      {tab === 'verbatim' && <Verbatim s={s} run={run} />}
      {tab === 'recognition' && <Recognition s={s} />}
      {tab === 'scheme' && <Scheme s={s} run={run} />}
    </div>
  );
}

function LiveMarks({ s, run }: { s: any; run: Run }) {
  const m = s.marking;
  const [newSeg, setNewSeg] = useState({ kind: 'mod', topic: '' });
  const [rec, setRec] = useState('');
  const [poi, setPoi] = useState({ by: '', to: '' });
  const [chit, setChit] = useState({ kind: 'substantive', by: '', to: '', score: '' });
  const seg = m.segments.find((x: any) => x.id === m.currentSegment);
  const name = (id: string | null) => s.delegates.find((d: any) => d.id === id)?.name ?? '—';
  const code = (id: string | null) => s.delegates.find((d: any) => d.id === id)?.code;
  const speeches = m.speeches.filter((x: any) => x.segmentId === m.currentSegment);
  const pois = m.pois.filter((x: any) => x.segmentId === m.currentSegment);
  return (
    <div className="mk-grid">
      <div className="pf-card pad">
        <b>Segments</b>
        <div className="mk-segs">
          {m.segments.map((x: any) => <button key={x.id} className={`mk-seg ${x.id === m.currentSegment ? 'on' : ''}`} onClick={() => run({ type: 'eb_segment_select', segmentId: x.id })}>
            <span className="mk-seg-l">{x.label}</span><span className="pf-small pf-muted">{x.topic ?? (x.kind === 'gsl' ? 'General speakers list' : 'Caucus')} · Day {x.day}</span>
            <span className="pf-tag">{m.speeches.filter((sp: any) => sp.segmentId === x.id).length}</span></button>)}
          {!m.segments.length && <div className="pf-small pf-muted">Segments open on their own when the speakers list or a moderated caucus starts. You can also add one.</div>}
        </div>
        <div className="mk-row" style={{ marginTop: 10 }}>
          <select className="pf-input mk-select" style={{ maxWidth: 110 }} value={newSeg.kind} onChange={(e) => setNewSeg({ ...newSeg, kind: e.target.value })} aria-label="Segment type"><option value="mod">Mod</option><option value="gsl">GSL</option><option value="other">Other</option></select>
          <input className="pf-input mk-select" placeholder="Topic (optional)" value={newSeg.topic} onChange={(e) => setNewSeg({ ...newSeg, topic: e.target.value })} />
          <button className="pf-btn ghost sm" onClick={() => { run({ type: 'eb_segment', kind: newSeg.kind, topic: newSeg.topic || null }); setNewSeg({ kind: 'mod', topic: '' }); }}><Plus className="icon" />Add</button>
        </div>
      </div>

      <div className="pf-card pad">
        <div className="mk-row"><b style={{ flex: 1 }}>{seg ? `${seg.label}${seg.topic ? ` · ${seg.topic}` : ''}` : 'Speeches'}</b>{seg && <span className="pf-small pf-muted">{seg.totalSeconds ? `${Math.round(seg.totalSeconds / 60)} min` : ''}{seg.speakingSeconds ? ` · ${seg.speakingSeconds}s each` : ''}</span>}</div>
        <div className="mk-row"><DelegatePick s={s} value={rec} onChange={setRec} label="Recognise a delegation" presentOnly /><button className="pf-btn primary sm" disabled={!rec} onClick={() => { run({ type: 'eb_recognise', delegateId: rec }); setRec(''); }}><UserCheck className="icon" />Recognise</button></div>
        {!speeches.length && <div className="pf-small pf-muted" style={{ padding: '8px 0' }}>No speeches in this segment yet.</div>}
        {[...speeches].reverse().map((sp: any) => (
          <div key={sp.id} className="mk-speech">
            <div className="mk-row"><Flag code={code(sp.delegateId)} title={name(sp.delegateId)} /><b style={{ flex: 1 }}>{name(sp.delegateId)}</b><span className="pf-small pf-faint">{new Date(sp.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
              <ScoreInput value={sp.score} max={m.scheme.speechMax} label={`Mark for ${name(sp.delegateId)}`} onSave={(v) => run({ type: 'eb_speech', speechId: sp.id, score: v })} />
              <button className="pf-btn link" aria-label="Remove speech" onClick={() => confirm('Remove this speech and its marks?') && run({ type: 'eb_speech_remove', speechId: sp.id })}><Trash2 className="icon" /></button></div>
            <Notes value={sp.notes} placeholder="Verbatim notes…" onSave={(v) => run({ type: 'eb_speech', speechId: sp.id, notes: v })} />
            <label className="pf-check pf-small"><input type="checkbox" checked={sp.offline} onChange={(e) => run({ type: 'eb_speech', speechId: sp.id, offline: e.target.checked })} />Noted offline</label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pf-card pad">
          <b>Points of information</b>
          <div className="mk-row" style={{ marginTop: 8 }}><DelegatePick s={s} value={poi.by} onChange={(v) => setPoi({ ...poi, by: v })} label="Asked by" presentOnly /><DelegatePick s={s} value={poi.to} onChange={(v) => setPoi({ ...poi, to: v })} label="To" /></div>
          <button className="pf-btn ghost sm" disabled={!poi.by} onClick={() => { run({ type: 'eb_poi', by: poi.by, to: poi.to || s.speakers.current }); setPoi({ by: '', to: '' }); }}><Plus className="icon" />Add POI</button>
          {[...pois].reverse().map((p: any) => (
            <div key={p.id} className="mk-line"><span style={{ flex: 1 }}><b>{name(p.by)}</b>{p.to ? <span className="pf-muted"> → {name(p.to)}</span> : null}</span>
              <ScoreInput value={p.score} max={m.scheme.poiMax} label="POI mark" onSave={(v) => run({ type: 'eb_poi_edit', poiId: p.id, score: v })} />
              <button className="pf-btn link" aria-label="Remove POI" onClick={() => run({ type: 'eb_poi_remove', poiId: p.id })}><X className="icon" /></button></div>
          ))}
        </div>
        <div className="pf-card pad">
          <b>Chits</b>
          <div className="mk-row" style={{ marginTop: 8 }}>
            <select className="pf-input mk-select" style={{ maxWidth: 140 }} value={chit.kind} onChange={(e) => setChit({ ...chit, kind: e.target.value })} aria-label="Chit type"><option value="substantive">Substantive</option><option value="poi">POI chit</option></select>
            <DelegatePick s={s} value={chit.by} onChange={(v) => setChit({ ...chit, by: v })} label="From" />
          </div>
          <div className="mk-row"><DelegatePick s={s} value={chit.to} onChange={(v) => setChit({ ...chit, to: v })} label="To (or the EB)" />
            <input className="mk-score" type="number" step="0.05" min={0} max={m.scheme.chitMax} placeholder={`/${m.scheme.chitMax}`} value={chit.score} onChange={(e) => setChit({ ...chit, score: e.target.value })} aria-label="Chit mark" /></div>
          <button className="pf-btn ghost sm" disabled={!chit.by} onClick={() => { run({ type: 'eb_chit', kind: chit.kind, by: chit.by, to: chit.to || null, score: num(chit.score) }); setChit({ ...chit, by: '', to: '', score: '' }); }}><Plus className="icon" />Add chit</button>
          {[...m.chits].reverse().slice(0, 30).map((c: any) => (
            <div key={c.id} className="mk-line"><span style={{ flex: 1 }}><b>{name(c.by)}</b><span className="pf-muted"> {c.kind === 'poi' ? 'POI chit' : 'substantive'}{c.to ? ` → ${name(c.to)}` : ''}</span></span>
              <ScoreInput value={c.score} max={m.scheme.chitMax} label="Chit mark" onSave={(v) => run({ type: 'eb_chit_edit', chitId: c.id, score: v })} />
              <button className="pf-btn link" aria-label="Remove chit" onClick={() => run({ type: 'eb_chit_remove', chitId: c.id })}><X className="icon" /></button></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sheet({ s, run }: { s: any; run: Run }) {
  const ms = s.marksheet; const m = s.marking;
  const manual = ms.scheme.groups.filter((g: any) => g.sources.includes('manual'));
  const days: number[] = ms.days.length ? ms.days : [m.day];
  const code = (id: string) => s.delegates.find((d: any) => d.id === id)?.code;
  return (
    <div className="pf-card" style={{ overflowX: 'auto' }}>
      <table className="mk-table">
        <thead><tr>
          <th>#</th><th className="l">Portfolio</th>{days.map((d) => <th key={d}>Day {d}</th>)}
          {ms.columns.map((c: string) => <th key={c}>{c}</th>)}<th>Verbal POI</th><th>Subst. chits</th><th>POI chits</th>
          {manual.map((g: any) => <th key={g.key}>{g.label}{g.max ? <div className="pf-faint">/{g.max}</div> : null}</th>)}
          {ms.scheme.groups.filter((g: any) => !g.sources.includes('manual') || g.sources.length > 1).map((g: any) => <th key={g.key} className="grp">{g.label}{g.weight !== 1 ? ` ${Math.round(g.weight * 100)}%` : ''}</th>)}
          <th className="tot">Total</th><th className="l">Award</th>
        </tr></thead>
        <tbody>
          {ms.rows.map((r: any) => (
            <tr key={r.delegateId}>
              <td className="rank">{r.rank}</td>
              <td className="l"><span className="mk-row" style={{ gap: 8, flexWrap: 'nowrap' }}><Flag code={code(r.delegateId)} title={r.portfolio} />{r.portfolio}</span></td>
              {days.map((d) => <td key={d}><select className="mk-att" value={r.attendance[d] || ''} onChange={(e) => run({ type: 'eb_attendance', day: d, delegateId: r.delegateId, value: e.target.value || 'A' })} aria-label={`Day ${d} attendance for ${r.portfolio}`}><option value="">–</option><option>P</option><option>PV</option><option>A</option></select></td>)}
              {ms.columns.map((c: string) => <td key={c}>{r.segments[c] ?? '–'}</td>)}
              <td title={r.poiMarks.join(' + ')}>{r.sources.pois || '–'}</td><td>{r.sources.chits_substantive || '–'}</td><td>{r.sources.chits_poi || '–'}</td>
              {manual.map((g: any) => <td key={g.key}><ScoreInput value={r.manual[g.key]} max={g.max ?? 1000} label={`${g.label} for ${r.portfolio}`} onSave={(v) => run({ type: 'eb_manual', delegateId: r.delegateId, key: g.key, value: v })} /></td>)}
              {ms.scheme.groups.filter((g: any) => !g.sources.includes('manual') || g.sources.length > 1).map((g: any) => <td key={g.key} className="grp">{r.groups[g.key].weighted}</td>)}
              <td className="tot">{r.total}</td>
              <td className="l">{r.award ? <span className="pf-tag green"><Award className="icon" style={{ width: 12, height: 12 }} />{r.award}</span> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pf-small pf-muted" style={{ padding: 12 }}>Columns with several speeches use the {ms.scheme.segmentScore} mark. Awards go down the ranking in the order set in Scheme. Ties share a rank.</div>
    </div>
  );
}

function Verbatim({ s, run }: { s: any; run: Run }) {
  const m = s.marking;
  const name = (id: string) => s.delegates.find((d: any) => d.id === id)?.name ?? '—';
  if (!m.segments.length) return <div className="pf-card pad pf-muted">Nothing recorded yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {m.segments.map((seg: any) => (
        <div key={seg.id} className="pf-card pad">
          <div className="mk-row"><b style={{ flex: 1 }}>{seg.label}</b><input className="pf-input mk-select" style={{ maxWidth: 520 }} defaultValue={seg.topic ?? ''} placeholder="Topic" onBlur={(e) => e.target.value !== (seg.topic ?? '') && run({ type: 'eb_segment_edit', segmentId: seg.id, topic: e.target.value })} aria-label={`${seg.label} topic`} /></div>
          {m.speeches.filter((x: any) => x.segmentId === seg.id).map((sp: any) => (
            <div key={sp.id} className="mk-vb"><b>{name(sp.delegateId)}</b>{sp.offline ? <span className="pf-muted">Noted offline</span> : <Notes value={sp.notes} rows={2} placeholder="Verbatim notes…" onSave={(v) => run({ type: 'eb_speech', speechId: sp.id, notes: v })} />}<span className="pf-small">{sp.score ?? '–'}</span></div>
          ))}
          {!m.speeches.some((x: any) => x.segmentId === seg.id) && <div className="pf-small pf-muted">No speeches.</div>}
        </div>
      ))}
    </div>
  );
}

function Recognition({ s }: { s: any }) {
  const r = s.recognition;
  const cols = useMemo(() => r.segments.flatMap((x: any) => [{ h: x.label, l: x.speakers }, ...(x.pois.length ? [{ h: `${x.label} · POI`, l: x.pois }] : [])]), [r]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of s.delegates) c[d.name] = 0;
    for (const x of r.segments) for (const n of [...x.speakers, ...x.pois]) c[n] = (c[n] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => a[1] - b[1]);
  }, [r, s.delegates]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="pf-card pad">
        <b>Least recognised first</b>
        <p className="pf-small pf-muted" style={{ margin: '4px 0 10px' }}>Speeches and POIs so far. Use this to share the floor fairly.</p>
        <div className="mk-chips">{counts.map(([n, c]) => <span key={n} className={`pf-tag ${c === 0 ? 'amber' : ''}`}>{n} · {c}</span>)}</div>
      </div>
      <div className="pf-card" style={{ overflowX: 'auto' }}>
        <table className="mk-table"><thead><tr><th className="l">Motions</th>{cols.map((c: any) => <th key={c.h} className="l">{c.h}</th>)}</tr></thead>
          <tbody>{Array.from({ length: Math.max(r.motions.length, ...cols.map((c: any) => c.l.length), 1) }).map((_, i) => (
            <tr key={i}><td className="l">{r.motions[i] ? <><b>{r.motions[i].proposer}</b> <span className="pf-muted">{r.motions[i].text} · {r.motions[i].status}</span></> : ''}</td>{cols.map((c: any) => <td key={c.h} className="l">{c.l[i] ?? ''}</td>)}</tr>
          ))}</tbody></table>
      </div>
    </div>
  );
}

function Scheme({ s, run }: { s: any; run: Run }) {
  const sc = s.marking.scheme;
  const [f, setF] = useState(() => structuredClone(sc));
  useEffect(() => setF(structuredClone(sc)), [JSON.stringify(sc)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [presets, setPresets] = useState<{ key: string; label: string }[]>([]);
  useEffect(() => { fetch('/api/live/meta').then((r) => r.json()).then((d) => setPresets(d.presets ?? [])).catch(() => {}); }, []);
  const g = (i: number, patch: any) => setF({ ...f, groups: f.groups.map((x: any, j: number) => (i === j ? { ...x, ...patch } : x)) });
  return (
    <div className="mk-grid two">
      <div className="pf-card pad">
        <b>Scheme</b>
        <div className="mk-form">
          <label>Start from<select className="pf-input mk-select" value={f.preset} onChange={(e) => confirm('Replace the scheme with this preset? Marks already given stay.') && run({ type: 'eb_scheme', scheme: { preset: e.target.value } })}>{presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
          <div className="mk-row">
            <label>Speech out of<input className="pf-input mk-select" type="number" value={f.speechMax} onChange={(e) => setF({ ...f, speechMax: e.target.value })} /></label>
            <label>POI out of<input className="pf-input mk-select" type="number" value={f.poiMax} onChange={(e) => setF({ ...f, poiMax: e.target.value })} /></label>
            <label>Chit out of<input className="pf-input mk-select" type="number" value={f.chitMax} onChange={(e) => setF({ ...f, chitMax: e.target.value })} /></label>
          </div>
          <label>Several speeches in one column<select className="pf-input mk-select" value={f.segmentScore} onChange={(e) => setF({ ...f, segmentScore: e.target.value })}><option value="average">Average them</option><option value="sum">Add them up</option><option value="best">Keep the best</option></select></label>
        </div>
        <b style={{ display: 'block', marginTop: 16 }}>Criteria</b>
        {f.groups.map((x: any, i: number) => (
          <div key={i} className="mk-crit">
            <div className="mk-row"><input className="pf-input mk-select" value={x.label} onChange={(e) => g(i, { label: e.target.value })} aria-label="Criterion name" />
              <label className="pf-small">Weight<input className="mk-score" type="number" step="0.05" value={x.weight} onChange={(e) => g(i, { weight: e.target.value })} /></label>
              <label className="pf-small">Max<input className="mk-score" type="number" value={x.max ?? ''} placeholder="–" onChange={(e) => g(i, { max: e.target.value === '' ? null : e.target.value })} /></label>
              <button className="pf-btn link" aria-label="Remove criterion" onClick={() => setF({ ...f, groups: f.groups.filter((_: any, j: number) => j !== i) })}><X className="icon" /></button></div>
            <div className="mk-chips">{SOURCES.map(([k, l]) => <label key={k} className={`mk-chip ${x.sources.includes(k) ? 'on' : ''}`}><input type="checkbox" checked={x.sources.includes(k)} onChange={(e) => g(i, { sources: e.target.checked ? [...x.sources, k] : x.sources.filter((y: string) => y !== k) })} />{l}</label>)}</div>
          </div>
        ))}
        <button className="pf-btn ghost sm" onClick={() => setF({ ...f, groups: [...f.groups, { key: '', label: 'New criterion', weight: 1, sources: ['manual'], max: 5 }] })}><Plus className="icon" />Add criterion</button>
      </div>
      <div className="pf-card pad">
        <b>Awards</b>
        <p className="pf-small pf-muted" style={{ margin: '4px 0 10px' }}>Given down the ranking, in this order.</p>
        {f.awards.map((a: any, i: number) => (
          <div key={i} className="mk-row"><input className="pf-input mk-select" value={a.label} onChange={(e) => setF({ ...f, awards: f.awards.map((x: any, j: number) => (i === j ? { ...x, label: e.target.value } : x)) })} aria-label="Award" />
            <input className="mk-score" type="number" min={0} value={a.count} onChange={(e) => setF({ ...f, awards: f.awards.map((x: any, j: number) => (i === j ? { ...x, count: e.target.value } : x)) })} aria-label="How many" />
            <button className="pf-btn link" aria-label="Remove award" onClick={() => setF({ ...f, awards: f.awards.filter((_: any, j: number) => j !== i) })}><X className="icon" /></button></div>
        ))}
        <button className="pf-btn ghost sm" onClick={() => setF({ ...f, awards: [...f.awards, { label: 'Honourable Mention', count: 1 }] })}><Plus className="icon" />Add award</button>
        <div style={{ marginTop: 18 }}><button className="pf-btn primary" onClick={() => run({ type: 'eb_scheme', scheme: { speechMax: Number(f.speechMax), poiMax: Number(f.poiMax), chitMax: Number(f.chitMax), segmentScore: f.segmentScore, groups: f.groups.map((x: any) => ({ ...x, weight: Number(x.weight), max: x.max === null || x.max === '' ? null : Number(x.max) })), awards: f.awards } })}>Save scheme</button></div>
      </div>
    </div>
  );
}

const AM_STATUS: Record<string, string> = { pending: 'Pending vote', passed: 'Passed', failed: 'Failed', incorporated: 'Incorporated', withdrawn: 'Withdrawn' };
/** Amendments to draft resolutions: friendly ones go straight in, unfriendly ones are voted on. */
export function Amendments({ s, run }: { s: any; run?: Run }) {
  const [f, setF] = useState({ draft: '', clause: '', text: '', proposer: '', kind: 'unfriendly' });
  const list = s.amendments ?? [];
  const name = (id: string | null) => s.delegates.find((d: any) => d.id === id)?.name ?? '';
  if (!run && !list.length) return null;
  return (
    <div className="pf-card pad">
      <b>Amendments</b>
      {run && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <div className="mk-row"><input className="pf-input mk-select" placeholder="Draft (e.g. DR 1.1)" value={f.draft} onChange={(e) => setF({ ...f, draft: e.target.value })} /><input className="pf-input mk-select" placeholder="Clause (e.g. OC 3)" value={f.clause} onChange={(e) => setF({ ...f, clause: e.target.value })} /></div>
        <textarea className="mk-notes" rows={2} placeholder="Amendment text: add, strike or replace…" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <div className="mk-row"><DelegatePick s={s} value={f.proposer} onChange={(v) => setF({ ...f, proposer: v })} label="Proposed by" presentOnly />
          <select className="pf-input mk-select" style={{ maxWidth: 140 }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Amendment type"><option value="unfriendly">Unfriendly</option><option value="friendly">Friendly</option></select></div>
        <button className="pf-btn ghost sm" disabled={!f.clause.trim() || !f.text.trim()} onClick={() => { run({ type: 'amend_add', ...f, proposer: f.proposer || null }); setF({ ...f, clause: '', text: '', proposer: '' }); }}><Plus className="icon" />Add amendment</button>
      </div>}
      {[...list].reverse().map((a: any) => (
        <div key={a.id} className="mk-amend">
          <div className="mk-row"><b style={{ flex: 1 }}>{a.draft} · {a.clause}</b><span className={`pf-tag ${a.status === 'passed' || a.status === 'incorporated' ? 'green' : a.status === 'pending' ? 'amber' : ''}`}>{a.kind === 'friendly' ? 'Friendly' : 'Unfriendly'} · {AM_STATUS[a.status]}</span></div>
          <div className="pf-small">{a.text}</div>
          {a.proposer && <div className="pf-small pf-muted">{name(a.proposer)}</div>}
          {run && a.status === 'pending' && <div className="mk-row" style={{ marginTop: 6 }}>
            <button className="pf-btn ghost sm" onClick={() => run({ type: 'vote_open', title: `Amendment to ${a.draft} ${a.clause}`, kind: 'substantive', rule: 'simple' })}>Open vote</button>
            <button className="pf-btn ghost sm" onClick={() => run({ type: 'amend_status', amendmentId: a.id, status: 'passed' })}>Passed</button>
            <button className="pf-btn ghost sm" onClick={() => run({ type: 'amend_status', amendmentId: a.id, status: 'failed' })}>Failed</button>
            <button className="pf-btn link" onClick={() => run({ type: 'amend_status', amendmentId: a.id, status: 'withdrawn' })}>Withdraw</button></div>}
        </div>
      ))}
    </div>
  );
}
