import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Search, ImagePlus, ChevronUp, ChevronsUp, Crown, ArrowDownAZ, BarChart3, Wand2, Info, Trash2 } from 'lucide-react';
import { BUNDLES, DELEGATIONS, countryName, importance, matchCountry } from '../data/countries';
import { EMBLEMS, DIFFICULTIES, LANGUAGES, TYPE_INFO, findPreset, type CommitteeType } from '../data/committees';
import { Emblem, Flag } from './art';

export interface PortfolioDraft { name: string; code: string | null; importance: 'high' | 'standard' | 'low'; taken?: number }
export interface CommitteeDraft {
  id?: string; type: CommitteeType; name: string; short: string; topics: string[]; difficulty: string; language: string; emblem: string;
  perCountry: number; portfolios: PortfolioDraft[]; description?: string;
}
export const blankCommittee = (type: CommitteeType): CommitteeDraft => ({ type, name: '', short: '', topics: [], difficulty: 'intermediate', language: 'English', emblem: TYPE_INFO[type].emblem, perCountry: 1, portfolios: [] });

/** Pick the committee type first (MUN, Crisis, Custom, Press). */
export function TypePicker({ onPick, onClose }: { onPick: (t: CommitteeType) => void; onClose: () => void }) {
  return (
    <div className="pf-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-label="Choose a committee type">
        <header><h2>Choose a committee type</h2><button className="pf-x" onClick={onClose} aria-label="Close"><X className="icon" /></button></header>
        <div className="body">
          <div className="pf-type-grid">
            {(Object.keys(TYPE_INFO) as CommitteeType[]).map((t) => (
              <button key={t} className="pf-type" onClick={() => onPick(t)}><Emblem k={TYPE_INFO[t].emblem} /><strong>{TYPE_INFO[t].label}</strong><span className="desc">{TYPE_INFO[t].blurb}</span></button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const diffIcon = [ChevronUp, ChevronsUp, ChevronsUp, Crown];

/** The two-panel committee editor. Typing a known committee name fills in its members, short name and emblem. */
export function CommitteeEditor({ initial, onSave, onCancel, busy }: { initial: CommitteeDraft; onSave: (c: CommitteeDraft) => void | Promise<void>; onCancel: () => void; busy?: boolean }) {
  const [c, setC] = useState<CommitteeDraft>(initial);
  const [touchedShort, setTouchedShort] = useState(!!initial.short);
  const [autoFrom, setAutoFrom] = useState<string | null>(null);  // the preset that filled the list, while untouched
  const [listTouched, setListTouched] = useState(initial.portfolios.length > 0);
  const [topic, setTopic] = useState('');
  const [q, setQ] = useState(''); const [hl, setHl] = useState(0);
  const [paste, setPaste] = useState('');
  const [sort, setSort] = useState<'az' | 'importance'>('az');
  const [emblemOpen, setEmblemOpen] = useState(false);
  const [editingShort, setEditingShort] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = TYPE_INFO[c.type];
  const isMun = c.type === 'mun';
  const set = (patch: Partial<CommitteeDraft>) => setC((x) => ({ ...x, ...patch }));

  // Auto-fill from the committee name ("UN Human Rights Council" → UNHRC with its member states).
  useEffect(() => {
    const p = findPreset(c.name, c.type);
    if (!p) { if (autoFrom && !listTouched) { set({ portfolios: [] }); setAutoFrom(null); } return; }
    if (p.short === autoFrom) return;
    const patch: Partial<CommitteeDraft> = { emblem: p.emblem };
    if (!touchedShort) patch.short = p.short;
    if (!listTouched || autoFrom) {
      patch.portfolios = p.portfolios.map((x) => ({ name: x.name || countryName(x.code), code: x.code ?? null, importance: importance(x.code) }));
      setAutoFrom(p.short);
    }
    set(patch);
  }, [c.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!touchedShort && !findPreset(c.name, c.type)) set({ short: shortFrom(c.name) }); }, [c.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = new Set(c.portfolios.map((p) => p.name.toLowerCase()));
  const addMany = (items: { name: string; code: string | null }[]) => {
    const fresh = items.filter((i) => i.name && !names.has(i.name.toLowerCase()));
    if (!fresh.length) return;
    setListTouched(true); setAutoFrom(null);
    set({ portfolios: [...c.portfolios, ...fresh.map((i) => ({ ...i, importance: importance(i.code) }))] });
  };
  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !isMun) return [];
    return DELEGATIONS.filter((d) => d.name.toLowerCase().includes(t) && !names.has(d.name.toLowerCase())).slice(0, 8);
  }, [q, c.portfolios, isMun]); // eslint-disable-line react-hooks/exhaustive-deps
  const addTyped = () => {
    const t = q.trim(); if (!t) return;
    if (isMun && suggestions[hl]) addMany([suggestions[hl]]);
    else { const m = isMun ? matchCountry(t) : { code: null, name: t }; addMany([m]); }
    setQ(''); setHl(0);
  };
  const addPaste = () => {
    const lines = paste.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    addMany(lines.map((l) => (isMun ? matchCountry(l) : { code: null, name: l.replace(/^[\d.)\-•*\s]+/, '').trim() })));
    setPaste('');
  };
  const sorted = useMemo(() => {
    const rank = { high: 0, standard: 1, low: 2 } as const;
    return [...c.portfolios].sort((a, b) => (sort === 'importance' ? rank[a.importance] - rank[b.importance] : 0) || a.name.localeCompare(b.name));
  }, [c.portfolios, sort]);
  const remove = (name: string) => { setListTouched(true); setAutoFrom(null); set({ portfolios: c.portfolios.filter((p) => p.name !== name) }); };
  const cycleImportance = (name: string) => set({ portfolios: c.portfolios.map((p) => (p.name === name ? { ...p, importance: p.importance === 'high' ? 'low' : p.importance === 'low' ? 'standard' : 'high' } : p)) });
  const canSave = c.name.trim().length >= 2 && c.portfolios.length > 0;
  const preset = autoFrom ? findPreset(c.name, c.type) : null;

  async function save() {
    setError(null);
    try { await onSave({ ...c, name: c.name.trim(), short: (c.short || shortFrom(c.name)).trim() }); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <div className="pf-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="pf-editor" role="dialog" aria-modal="true" aria-label={c.id ? 'Edit committee' : 'New committee'}>
        <div className="pf-modal">
          <header>
            <h2 style={{ flex: 'none' }}>{c.id ? 'Edit committee' : 'New committee'}</h2>
            <span className="pf-tag" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Emblem k={info.emblem} className="tiny" />{info.label}</span>
            <span style={{ flex: 1 }} />
            <button className="pf-x" onClick={onCancel} aria-label="Close"><X className="icon" /></button>
          </header>
          <div className="body">
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
                <Emblem k={c.emblem} size="lg" />
                <button className="pf-btn ghost sm" style={{ fontSize: 12.5, padding: '5px 10px', minHeight: 0 }} onClick={() => setEmblemOpen(!emblemOpen)}><ImagePlus className="icon" style={{ width: 14, height: 14 }} />Change emblem</button>
                {emblemOpen && (
                  <div className="pf-suggest" style={{ width: 268, top: '100%', left: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 10 }}>
                    {EMBLEMS.map((e) => <button key={e.key} title={e.label} onClick={() => { set({ emblem: e.key }); setEmblemOpen(false); }} style={{ padding: 2, justifyContent: 'center' }}><Emblem k={e.key} /></button>)}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: c.name ? 'var(--pf-ink)' : 'var(--pf-ink-3)', lineHeight: 1.15 }}>{c.short || c.name || 'Untitled committee'}</div>
                {c.short && c.name && <div className="pf-muted pf-small">{c.name}</div>}
                <div className="pf-small" style={{ marginTop: 4 }}><span style={{ color: 'var(--pf-gold)', fontWeight: 700 }}>Topic:</span> <span className="pf-muted">{c.topics[0] ?? 'No topic yet'}</span></div>
              </div>
              <div>
                <div className="pf-mini" style={{ marginTop: 0 }}>Difficulty <span className="opt">{DIFFICULTIES.find((d) => d.key === c.difficulty)?.label}</span></div>
                <div className="pf-diff">{DIFFICULTIES.map((d, i) => { const I = diffIcon[i]; return <button key={d.key} className={c.difficulty === d.key ? 'on' : ''} title={d.label} aria-label={d.label} onClick={() => set({ difficulty: d.key })}><I className="icon" style={{ width: 16, height: 16 }} /></button>; })}</div>
                <div className="pf-mini">Language</div>
                <select className="pf-input" style={{ minHeight: 40, padding: '6px 12px', fontSize: 14 }} value={c.language} onChange={(e) => set({ language: e.target.value })}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select>
              </div>
            </div>

            <div className="pf-sec"><span className="n">1</span>Committee</div>
            <div className="pf-mini">Name</div>
            <input className="pf-input" autoFocus value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder={c.type === 'mun' ? 'e.g. Human Rights Council or UNHRC' : c.type === 'press' ? 'e.g. International Press Corps' : c.type === 'crisis' ? 'e.g. Joint Crisis Committee' : 'e.g. Lok Sabha or ICJ'} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <span className="pf-mini" style={{ margin: 0 }}>Short name</span>
              {editingShort
                ? <input className="pf-input" style={{ width: 160, minHeight: 36, padding: '4px 12px', fontSize: 14 }} autoFocus value={c.short} maxLength={16} onChange={(e) => { setTouchedShort(true); set({ short: e.target.value.toUpperCase() }); }} onBlur={() => setEditingShort(false)} onKeyDown={(e) => e.key === 'Enter' && setEditingShort(false)} />
                : <button className="pf-chip" onClick={() => setEditingShort(true)}>{c.short || 'Add one'}</button>}
              <span className="pf-faint pf-small">Shown when the full name is long</span>
            </div>
            {preset && <div className="pf-note green" style={{ marginTop: 12 }}><Wand2 className="icon" /><span>Filled in from <b>{preset.short}</b>: {preset.portfolios.length} {info.noun}{preset.note ? `. ${preset.note}` : ''}. Add or remove any of them.</span></div>}

            <div className="pf-mini">Topics <span className="opt">up to 3</span></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="pf-input" style={{ minHeight: 48 }} value={topic} disabled={c.topics.length >= 3} placeholder={c.topics.length >= 3 ? 'Three topics added' : 'Type a topic, then press Enter'}
                onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && topic.trim()) { e.preventDefault(); set({ topics: [...c.topics, topic.trim()].slice(0, 3) }); setTopic(''); } }} />
              <button className="pf-btn primary sm" style={{ whiteSpace: 'nowrap' }} disabled={!topic.trim() || c.topics.length >= 3} onClick={() => { set({ topics: [...c.topics, topic.trim()].slice(0, 3) }); setTopic(''); }}>Add topic</button>
            </div>
            {c.topics.length > 0 && <div className="pf-chips" style={{ marginTop: 8 }}>{c.topics.map((t, i) => <button key={i} className="pf-chip" onClick={() => set({ topics: c.topics.filter((_, j) => j !== i) })}>{i + 1}. {t} <X className="x" style={{ width: 12, height: 12 }} /></button>)}</div>}

            <div className="pf-mini">About this committee <span className="opt">optional, shown on your public page</span></div>
            <textarea className="pf-input" style={{ minHeight: 70 }} maxLength={600} value={c.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="What delegates will debate and what to prepare" />

            <div className="pf-sec"><span className="n">2</span>Add {info.noun}</div>
            <div className="pf-mini">Search &amp; add</div>
            <div className="pf-search" style={{ position: 'relative' }}>
              <Search className="icon" />
              <input className="pf-input" style={{ minHeight: 48 }} value={q} onChange={(e) => { setQ(e.target.value); setHl(0); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } if (e.key === 'ArrowDown') setHl((h) => Math.min(h + 1, suggestions.length - 1)); if (e.key === 'ArrowUp') setHl((h) => Math.max(0, h - 1)); }}
                placeholder={isMun ? 'Search countries or type a name…' : `Type a ${info.noun.slice(0, -1)} and press Enter`} aria-label="Add" />
              {suggestions.length > 0 && <div className="pf-suggest">{suggestions.map((s, i) => <button key={s.code} className={i === hl ? 'hl' : ''} onMouseDown={(e) => { e.preventDefault(); addMany([s]); setQ(''); }}><Flag code={s.code} />{s.name}</button>)}</div>}
            </div>
            {isMun && <>
              <div className="pf-mini">Quick bundles</div>
              <div className="pf-chips">{BUNDLES.map((b) => <button key={b.key} className="pf-chip" onClick={() => addMany(b.codes.map((code) => ({ code, name: countryName(code) })))}>{b.label} <small>+{b.codes.filter((x) => !names.has(countryName(x).toLowerCase())).length}</small></button>)}</div>
            </>}
            <div className="pf-mini">Paste a list</div>
            <textarea className="pf-input" style={{ minHeight: 88 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={isMun ? 'France\nGermany\nRepublic of Korea' : 'One per line'} />
            <div style={{ marginTop: 8 }}><button className="pf-btn ghost sm" disabled={!paste.trim()} onClick={addPaste}><Plus className="icon" />Add from list</button></div>
          </div>
          {error && <div className="pf-err" style={{ padding: '0 24px 8px' }}>{error}</div>}
          <footer>
            <button className="pf-btn ghost" onClick={onCancel}>Cancel</button>
            <button className="pf-btn primary" disabled={!canSave || busy} onClick={save} style={{ flexDirection: 'column', gap: 0 }}>
              {c.id ? 'Save committee' : 'Add committee'}
              {!canSave && <small style={{ fontWeight: 500, fontSize: 12, opacity: .85 }}>Needs a name and at least one {info.noun.slice(0, -1)}</small>}
            </button>
          </footer>
        </div>

        <div className="side">
          <header>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="count">{c.portfolios.length}</span><b>{info.noun}</b>
              <span style={{ flex: 1 }} />
              {c.portfolios.length > 0 && <button className="pf-btn link" style={{ fontSize: 12.5 }} onClick={() => { setListTouched(true); setAutoFrom(null); set({ portfolios: c.portfolios.filter((p) => p.taken) }); }}>Clear all</button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <span className="pf-stepper"><button disabled={c.perCountry <= 1} onClick={() => set({ perCountry: c.perCountry - 1 })} aria-label="Fewer">−</button><b>{c.perCountry}</b><button disabled={c.perCountry >= 4} onClick={() => set({ perCountry: c.perCountry + 1 })} aria-label="More">+</button></span>
              <span className="pf-small pf-muted">delegate{c.perCountry > 1 ? 's' : ''} per {isMun ? 'country' : c.type === 'press' ? 'outlet' : 'seat'}</span>
            </div>
            {c.portfolios.length > 0 && <div style={{ marginTop: 10 }} className="pf-seg"><button className={sort === 'az' ? 'on' : ''} onClick={() => setSort('az')}><ArrowDownAZ style={{ width: 14, height: 14 }} />A–Z</button><button className={sort === 'importance' ? 'on' : ''} onClick={() => setSort('importance')}><BarChart3 style={{ width: 14, height: 14 }} />Importance</button></div>}
          </header>
          <div className="list">
            {!c.portfolios.length && <div className="pf-center pf-muted" style={{ padding: '60px 16px' }}><div className="plus" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--pf-white)', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}><Info className="icon" /></div><b style={{ color: 'var(--pf-ink)' }}>No {info.noun} yet</b><div className="pf-small" style={{ marginTop: 4 }}>{isMun ? 'Type a committee name, search, pick a bundle, or paste a list on the left.' : 'Add them on the left, or paste a list.'}</div></div>}
            {sorted.map((p) => (
              <div className="item" key={p.name}>
                {isMun ? <Flag code={p.code} round title={p.name} /> : <span className="flag blank round" title={p.name}>{p.name.slice(0, 1)}</span>}
                <span className="name" title={p.name}>{p.name}</span>
                <button title={`Importance: ${p.importance}. Used to place experienced delegates.`} aria-label={`Importance ${p.importance}`} onClick={() => cycleImportance(p.name)}>
                  <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end', height: 14 }}>{[1, 2, 3].map((n) => <i key={n} style={{ width: 3, height: 4 + n * 3, borderRadius: 2, background: n <= ({ high: 3, standard: 2, low: 1 } as const)[p.importance] ? 'var(--pf-brand-2)' : 'var(--pf-line-2)' }} />)}</span>
                </button>
                {p.taken ? <span className="pf-tag" title="A delegate holds this seat">taken</span> : <button onClick={() => remove(p.name)} aria-label={`Remove ${p.name}`}><Trash2 style={{ width: 15, height: 15 }} /></button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function shortFrom(name: string) {
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !/^(of|the|and|for|in|on|at|a|an)$/i.test(w));
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 10).toUpperCase();
  return words.map((w) => w[0].toUpperCase()).join('').slice(0, 10);
}

/** Convert the editor's draft into the API shape. */
export const toApi = (c: CommitteeDraft) => ({
  type: c.type, name: c.name, short: c.short, topics: c.topics, difficulty: c.difficulty, language: c.language, emblem: c.emblem, perCountry: c.perCountry, description: c.description ?? '',
  portfolios: c.portfolios.map((p) => ({ name: p.name, code: p.code, importance: p.importance })),
});
/** And back, from the committee detail endpoint. */
export const fromApi = (d: any): CommitteeDraft => ({
  id: d.id, type: d.type ?? 'mun', name: d.name, short: d.short, topics: d.topics ?? [], difficulty: d.difficulty ?? 'intermediate', language: d.language ?? 'English', emblem: d.emblem ?? 'globe',
  perCountry: d.perCountry ?? 1, description: d.description ?? '', portfolios: (d.portfolios ?? []).map((p: any) => ({ name: p.name, code: p.code, importance: p.tier, taken: p.taken })),
});
