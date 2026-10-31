import { useMemo, useState } from 'react';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import { api } from '../api';
import { Flag } from '../platform/art';
import { usePerson } from '../platform/Shell';
import { BLOCS, MEMBERS, OBSERVERS, REGIONAL_GROUPS, memberByCode, type Member } from '../data/mun';
import { AiBadge, Busy, Copy, ErrorNote, Markdown, PrepShell, Sources, refreshPrep, usePrepMeta } from './common';

export function CountriesPage() {
  const meta = usePrepMeta();
  const me = usePerson();
  const [tab, setTab] = useState<'directory' | 'compare' | 'blocs'>('directory');
  const [q, setQ] = useState(''); const [group, setGroup] = useState(''); const [bloc, setBloc] = useState('');
  const [sel, setSel] = useState<Member | null>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  const [ai, setAi] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const list = useMemo(() => MEMBERS.filter((m) => (!group || m.group === group) && (!bloc || m.blocs.includes(bloc)) && (!q || `${m.name} ${m.capital}`.toLowerCase().includes(q.toLowerCase()))), [q, group, bloc]);
  return (
    <PrepShell title="Countries" subtitle="All 193 UN member states with their regional group, capital and blocs. Compare delegations and build voting blocs." actions={<AiBadge meta={meta} />}>
      <div className="pp-tabs"><button className={tab === 'directory' ? 'on' : ''} onClick={() => setTab('directory')}>Member states</button><button className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>Compare</button><button className={tab === 'blocs' ? 'on' : ''} onClick={() => setTab('blocs')}>Bloc builder</button></div>
      {tab === 'directory' && <>
        <div className="pf-filters" style={{ marginTop: 0 }}>
          <div className="pf-search grow"><Search className="icon" /><input className="pf-input" style={{ width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a country or a capital" aria-label="Search countries" /></div>
          <select className="pf-input" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Regional group"><option value="">All regional groups</option>{Object.entries(REGIONAL_GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label} ({g.codes.length})</option>)}</select>
          <select className="pf-input" value={bloc} onChange={(e) => setBloc(e.target.value)} aria-label="Bloc"><option value="">Any bloc</option>{Object.entries(BLOCS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select>
        </div>
        <div className="pf-small pf-muted" style={{ marginBottom: 10 }}>{list.length} of 193 member states · Observer states: {OBSERVERS.map((o) => o.name).join(', ')}</div>
        <div className="pp-countries">{list.map((m) => <button key={m.code} className={`pp-country ${sel?.code === m.code ? 'on' : ''}`} onClick={() => setSel(m)}><Flag code={m.code} title={m.name} /><span><b>{m.name}</b><span className="pf-small pf-muted">{m.capital}</span></span></button>)}</div>
        {sel && <div className="pf-scrim" onClick={() => setSel(null)}><div className="pf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={sel.name}>
          <header><Flag code={sel.code} round /><h2>{sel.name}</h2><button className="pf-x" onClick={() => setSel(null)} aria-label="Close"><X className="icon" /></button></header>
          <div className="body">
            <dl className="pp-dl"><dt>Capital</dt><dd>{sel.capital || '—'}</dd><dt>Continent</dt><dd>{sel.continent}</dd><dt>UN regional group</dt><dd>{REGIONAL_GROUPS[sel.group].label}</dd><dt>Blocs</dt><dd>{sel.blocs.length ? sel.blocs.map((b) => BLOCS[b].label).join(', ') : '—'}</dd></dl>
            <div className="mk-row" style={{ marginTop: 14 }}><button className="pf-btn ghost sm" onClick={() => { setCmp((c) => [...new Set([...c, sel.code])].slice(0, 4)); setTab('compare'); setSel(null); }}><Plus className="icon" />Compare</button><a className="pf-btn ghost sm" href={`/prep/research?country=${encodeURIComponent(sel.name)}`}>Research this country</a></div>
          </div>
        </div></div>}
      </>}
      {tab === 'compare' && <section className="pf-card pad">
        <div className="mk-row"><select className="pf-input mk-select" style={{ maxWidth: 320 }} value="" onChange={(e) => e.target.value && setCmp([...new Set([...cmp, e.target.value])].slice(0, 4))} aria-label="Add a country"><option value="">Add a country (up to 4)…</option>{MEMBERS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
          {cmp.map((c) => <span key={c} className="pf-tag blue">{memberByCode(c)?.name}<button className="pf-btn link" style={{ padding: 0 }} onClick={() => setCmp(cmp.filter((x) => x !== c))} aria-label="Remove"><X className="icon" style={{ width: 12 }} /></button></span>)}</div>
        {cmp.length > 0 && <div className="pp-table" style={{ marginTop: 14 }}><table><thead><tr><th></th>{cmp.map((c) => <th key={c}><Flag code={c} /> {memberByCode(c)?.name}</th>)}</tr></thead><tbody>
          <tr><td>Capital</td>{cmp.map((c) => <td key={c}>{memberByCode(c)?.capital}</td>)}</tr>
          <tr><td>Regional group</td>{cmp.map((c) => <td key={c}>{REGIONAL_GROUPS[memberByCode(c)!.group].label}</td>)}</tr>
          {Object.entries(BLOCS).filter(([k]) => cmp.some((c) => memberByCode(c)?.blocs.includes(k))).map(([k, b]) => <tr key={k}><td>{b.label}</td>{cmp.map((c) => <td key={c}>{memberByCode(c)?.blocs.includes(k) ? '✓' : ''}</td>)}</tr>)}
          <tr><td>Shared blocs</td><td colSpan={cmp.length}>{Object.entries(BLOCS).filter(([k]) => cmp.length > 1 && cmp.every((c) => memberByCode(c)?.blocs.includes(k))).map(([, b]) => b.label).join(', ') || 'None'}</td></tr>
        </tbody></table></div>}
        <div className="mk-row" style={{ marginTop: 14 }}>
          {me?.person ? <button className="pf-btn primary ai sm" disabled={cmp.length < 2 || busy} onClick={async () => { setErr(null); setBusy(true); try { setAi(await api.post('/api/prep/compare', { countries: cmp.map((c) => memberByCode(c)!.name) })); refreshPrep(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}><Sparkles className="icon" />Population, GDP and HDI with sources</button> : <span className="pf-small pf-muted">Sign in to add sourced figures (population, GDP, HDI).</span>}
        </div>
        <ErrorNote error={err} />{busy && <Busy label="Looking up the latest figures…" />}
        {ai && <div className="pp-answer"><Markdown text={ai.text} /><Sources sources={ai.sources} /></div>}
      </section>}
      {tab === 'blocs' && <BlocBuilder />}
    </PrepShell>
  );
}

function BlocBuilder() {
  const [blocs, setBlocs] = useState<{ name: string; codes: string[] }[]>(() => { try { return JSON.parse(localStorage.getItem('dd-blocs') ?? '') || [{ name: 'Bloc A', codes: [] }, { name: 'Bloc B', codes: [] }]; } catch { return [{ name: 'Bloc A', codes: [] }, { name: 'Bloc B', codes: [] }]; } });
  const [pick, setPick] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const save = (b: typeof blocs) => { setBlocs(b); try { localStorage.setItem('dd-blocs', JSON.stringify(b)); } catch { /* private mode */ } };
  const placed = new Set(blocs.flatMap((b) => b.codes));
  const move = (code: string, to: number) => save(blocs.map((b, i) => ({ ...b, codes: i === to ? [...new Set([...b.codes, code])] : b.codes.filter((c) => c !== code) })));
  const text = blocs.map((b) => `${b.name}: ${b.codes.map((c) => memberByCode(c)?.name).join(', ') || '—'}`).join('\n');
  return (
    <section>
      <div className="mk-row"><select className="pf-input mk-select" style={{ maxWidth: 300 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Country"><option value="">Country…</option>{MEMBERS.filter((m) => !placed.has(m.code)).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
        {blocs.map((b, i) => <button key={i} className="pf-btn ghost sm" disabled={!pick} onClick={() => { move(pick, i); setPick(''); }}>Add to {b.name}</button>)}
        <button className="pf-btn ghost sm" onClick={() => save([...blocs, { name: `Bloc ${String.fromCharCode(65 + blocs.length)}`, codes: [] }])}><Plus className="icon" />Bloc</button><Copy text={text} label="Copy blocs" /><span className="pf-small pf-muted">Drag countries between blocs. Saved on this device.</span></div>
      <div className="pp-blocs">{blocs.map((b, i) => (
        <div key={i} className="pf-card pad pp-bloc" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move(drag, i); setDrag(null); }}>
          <div className="mk-row"><input className="pf-input mk-select" value={b.name} onChange={(e) => save(blocs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Bloc name" /><span className="pf-tag">{b.codes.length}</span>{blocs.length > 1 && <button className="pf-btn link" onClick={() => save(blocs.filter((_, j) => j !== i))} aria-label="Remove bloc"><X className="icon" /></button>}</div>
          <div className="pp-chips">{b.codes.map((c) => <span key={c} className="pf-chip" draggable onDragStart={() => setDrag(c)}><Flag code={c} />{memberByCode(c)?.name}<button className="pf-btn link" style={{ padding: 0, minHeight: 0 }} onClick={() => save(blocs.map((x, j) => (j === i ? { ...x, codes: x.codes.filter((y) => y !== c) } : x)))} aria-label="Remove"><X className="icon" style={{ width: 12 }} /></button></span>)}</div>
          {!b.codes.length && <div className="pf-small pf-faint">Drop countries here</div>}
        </div>
      ))}</div>
    </section>
  );
}
