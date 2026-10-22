import { useState } from 'react';
import { api } from '../api';
import { inr, dt, toPaise } from '../format';
import { Alert, Btn, DataTable, ErrorBox, Field, Loading, Modal, Status, Tabs, useAsync, useToast, usePrompt } from '../ui';
import { PageHead, useStaff } from './Shell';
import { Plus, Trash2 } from 'lucide-react';
import { CommitteeEditor, TypePicker, blankCommittee, toApi, fromApi, type CommitteeDraft } from '../platform/CommitteeEditor';

export default function Allocation() {
  const { eventId, can } = useStaff();
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [tab, setTab] = useState<'inventory' | 'simulate' | 'swaps' | 'board'>('inventory');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [picking, setPicking] = useState(false);
  const [editor, setEditor] = useState<CommitteeDraft | null>(null);
  const toast = useToast();
  const openEditor = async (id: string) => { try { setEditor(fromApi(await api.get(`/api/admin/committees/${id}/detail`))); } catch (e: any) { toast(e.message, 'bad'); } };
  const ask = usePrompt();
  if (inv.error) return <ErrorBox error={inv.error} />;
  const total = (inv.data ?? []).reduce((s, c) => ({ seats: s.seats + c.seats, held: s.held + c.held, confirmed: s.confirmed + c.confirmed }), { seats: 0, held: 0, confirmed: 0 });
  return (
    <div className="stack">
      <PageHead title="Committees & allotment" subtitle="Committees, portfolios and seat inventory. Run automatic allotment or place delegates by hand.">{can('alloc.config') && <Btn kind="primary" icon={Plus} onClick={() => setPicking(true)}>Committee</Btn>}</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'inventory', label: 'Seats' }, ...(can('alloc.config') ? [{ key: 'simulate' as const, label: 'Simulator' }] : []), ...(can('alloc.move') ? [{ key: 'swaps' as const, label: 'Change requests' }] : []), { key: 'board', label: 'Executive board' }]} />
      {tab === 'inventory' && (!inv.data ? <Loading /> : <>
        <p className="muted">{total.seats} seats · {total.confirmed} confirmed · {total.held} held · {total.seats - total.held - total.confirmed} open. Seats are locked in the same database transaction that saves a registration, so a portfolio can never be given twice.</p>
        {inv.data.map((c) => (
          <div key={c.id} className="card flush">
            <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === c.id ? null : c.id)}>
              <h3>{c.name}</h3><span className="badge">{c.short}</span>{c.kind === 'double' && <span className="badge info">Double delegation</span>}
              <span className="spacer" />
              <div style={{ width: 180 }} className="bar-track" title={`${c.confirmed} confirmed, ${c.held} held of ${c.seats}`}>
                <div className="bar-fill" style={{ width: `${((c.confirmed + c.held) / Math.max(1, c.seats)) * 100}%`, background: 'var(--series-1)', opacity: 0.45 }} />
                <div className="bar-fill" style={{ width: `${(c.confirmed / Math.max(1, c.seats)) * 100}%`, background: 'var(--series-1)' }} />
              </div>
              <span className="small num">{c.confirmed + c.held}/{c.seats}</span>
              {can('alloc.config') && <button className="btn sm" onClick={(e) => { e.stopPropagation(); openEditor(c.id); }}>Edit</button>}
              {can('alloc.config') && <button className="btn sm ghost" title="Description and study guide" onClick={(e) => { e.stopPropagation(); setEditing(c); }}>Details</button>}
              {can('alloc.config') && c.held + c.confirmed === 0 && <button className="btn sm ghost" aria-label={`Delete ${c.short}`} onClick={async (e) => { e.stopPropagation(); if (await ask({ title: `Delete ${c.name}?`, message: 'Its portfolios and seats are removed. This cannot be undone.', danger: true, confirm: 'Delete' })) { try { await api.del(`/api/admin/committees/${c.id}`); inv.reload(); } catch (x: any) { toast(x.message, 'bad'); } } }}><Trash2 className="icon" /></button>}
            </div>
            {open === c.id && <div>
              <DataTable rows={c.portfolios} columns={[
                { key: 'name', label: 'Portfolio' }, { key: 'tier', label: 'Tier' }, { key: 'premium_paise', label: 'Premium', num: true },
                { key: 'seats', label: 'Seats', num: true }, { key: 'held', label: 'Held', num: true }, { key: 'confirmed', label: 'Confirmed', num: true },
                ...(can('alloc.config') ? [{ key: 'act', label: '', sort: false, render: (p: any) => <span className="row">
                  <button className="btn sm" onClick={async () => { const r = await ask({ title: `Edit ${p.name}`, fields: [{ key: 'tier', label: 'Tier', value: p.tier, options: ['high', 'standard', 'low'].map((v) => ({ value: v, label: v })) }, { key: 'premium', label: 'Premium ₹', value: String(p.premium_paise / 100) }, { key: 'seats', label: 'Seats', value: String(p.seats), type: 'number' }] }); if (r) { try { await api.post(`/api/admin/committees/${c.id}/portfolios`, { name: p.name, tier: r.tier, premium_paise: toPaise(r.premium), seats: Number(r.seats) }); inv.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Edit</button>
                  {p.held + p.confirmed === 0 && <button className="btn sm danger" onClick={async () => { await api.del(`/api/admin/portfolios/${p.id}`); inv.reload(); }}>Delete</button>}
                </span> }] : []),
              ]} />
              {can('alloc.config') && <AddPortfolios committee={c} onDone={inv.reload} />}
            </div>}
          </div>
        ))}
      </>)}
      {tab === 'simulate' && <Simulator committees={inv.data ?? []} />}
      {tab === 'swaps' && <Swaps />}
      {tab === 'board' && <Board committees={inv.data ?? []} />}
      {editing && <CommitteeEdit c={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); inv.reload(); }} />}
      <div className="pf pf-portal">
        {picking && <TypePicker onClose={() => setPicking(false)} onPick={(t) => { setPicking(false); setEditor(blankCommittee(t)); }} />}
        {editor && <CommitteeEditor initial={editor} onCancel={() => setEditor(null)} onSave={async (c) => {
          if (c.id) await api.put(`/api/admin/committees/${c.id}/full`, toApi(c));
          else await api.post(`/api/admin/events/${eventId}/committees/full`, toApi(c));
          toast(c.id ? 'Committee saved' : `${c.short} added with ${c.portfolios.length} portfolios`, 'ok'); setEditor(null); inv.reload();
        }} />}
      </div>
    </div>
  );
}

function AddPortfolios({ committee, onDone }: any) {
  const [text, setText] = useState('');
  const toast = useToast();
  return (
    <div className="stack" style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
      <Field label="Add portfolios" hint="one per line: name, tier (high/standard/low), premium ₹ — e.g. “France, high, 300”"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'Argentina, standard\nChina, high, 300'} /></Field>
      <div><Btn onClick={async () => {
        const portfolios = text.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((p) => p[0]).map(([name, tier, premium]) => ({ name, tier: tier || 'standard', premium_paise: premium ? toPaise(premium) : 0, seats: committee.kind === 'double' ? 2 : 1 }));
        if (!portfolios.length) return;
        await api.post(`/api/admin/committees/${committee.id}/portfolios`, { portfolios }); setText(''); toast(`${portfolios.length} added`, 'ok'); onDone();
      }}>Add</Btn></div>
    </div>
  );
}

function CommitteeEdit({ c, onClose, onDone }: any) {
  const { eventId } = useStaff();
  const [f, setF] = useState({ ...c });
  return (
    <Modal title={c.id ? `Edit ${c.name}` : 'New committee'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={async () => { await api.post(`/api/admin/events/${eventId}/committees`, f); onDone(); }}>Save</Btn></>}>
      <div className="grid g2">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Short code"><input value={f.short} onChange={(e) => setF({ ...f, short: e.target.value.toUpperCase() })} /></Field>
        <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="single">Single delegation</option><option value="double">Double delegation (2 per portfolio)</option></select></Field>
        <Field label="Display order"><input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} /></Field>
        <Field label="Background guide URL"><input value={f.guide_url ?? ''} onChange={(e) => setF({ ...f, guide_url: e.target.value })} /></Field>
        <Field label="Description"><input value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Simulator({ committees }: { committees: any[] }) {
  const { eventId } = useStaff();
  const [count, setCount] = useState('120'); const [schools, setSchools] = useState('15');
  const [out, setOut] = useState<any>(null);
  return (
    <div className="stack">
      <Alert tone="info">Runs the real allocation engine on a test list inside a database transaction that is always rolled back. Nothing is saved.</Alert>
      <div className="row"><Field label="Test delegates"><input type="number" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 140 }} /></Field><Field label="Institutions"><input type="number" value={schools} onChange={(e) => setSchools(e.target.value)} style={{ width: 140 }} /></Field><span className="spacer" /><Btn kind="primary" onClick={async () => setOut(await api.post(`/api/admin/events/${eventId}/simulate`, { count: Number(count), schools: Number(schools) }))}>Run dry batch</Btn></div>
      {out && <>
        <div className="grid g4">{out.fill.map((f: any) => <div key={f.short} className="tile"><div className="label">{f.name}</div><div className="value">{f.filled}/{f.seats}</div><div className="sub">{Math.round((f.filled / f.seats) * 100)}% full</div></div>)}</div>
        <p className="muted">{out.results.filter((r: any) => r.waitlist).length} would be waitlisted; {out.results.filter((r: any) => r.fallback).length} placed outside their preferences.</p>
        <div className="card flush"><DataTable rows={out.results} rowKey={(r: any) => r.name} columns={[{ key: 'name', label: 'Test delegate' }, { key: 'institution', label: 'Institution' }, { key: 'experience', label: 'Experience' }, { key: 'committee', label: 'Committee' }, { key: 'portfolio', label: 'Portfolio' }, { key: 'tier', label: 'Tier' }, { key: 'waitlist', label: 'Waitlist #' }]} maxHeight={500} /></div>
      </>}
      {!committees.length && <p className="muted">Add committees and portfolios first.</p>}
    </div>
  );
}

function Swaps() {
  const { eventId } = useStaff();
  const s = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/swaps`), [eventId]);
  const toast = useToast();
  return (
    <div className="card flush"><DataTable rows={s.data ?? []} empty="No change requests." columns={[
      { key: 'created_at', label: 'Requested', render: (r: any) => dt(r.created_at) }, { key: 'ref', label: 'Delegate', render: (r: any) => `${r.full_name} (${r.ref})` }, { key: 'to_committee', label: 'Wants' }, { key: 'note', label: 'Note' }, { key: 'status', label: 'Status', render: (r: any) => <Status value={r.status} /> },
      { key: 'act', label: '', sort: false, render: (r: any) => r.status === 'pending' && <span className="row">
        <Btn size="sm" kind="good" onClick={async () => { try { await api.post(`/api/admin/swaps/${r.id}`, { approve: true }); toast('Moved', 'ok'); s.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Approve</Btn>
        <Btn size="sm" kind="danger" onClick={async () => { await api.post(`/api/admin/swaps/${r.id}`, { approve: false }); s.reload(); }}>Decline</Btn></span> },
    ]} /></div>
  );
}

function Board({ committees }: { committees: any[] }) {
  const { eventId, can } = useStaff();
  const b = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/executive-board`), [eventId]);
  const ask = usePrompt();
  return (
    <div className="card flush">
      <div className="card-head"><h3>Executive board</h3><span className="spacer" />{can('alloc.config') && <Btn size="sm" onClick={async () => { const r = await ask({ title: 'Add board member', fields: [{ key: 'committee_id', label: 'Committee', options: [{ value: '', label: 'Secretariat' }, ...committees.map((c) => ({ value: c.id, label: c.name }))] }, { key: 'position', label: 'Position', options: ['Director', 'Chair', 'Vice-Chair', 'Rapporteur', 'Secretary-General', 'Under-Secretary-General'].map((v) => ({ value: v, label: v })) }, { key: 'name', label: 'Name', required: true }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }] }); if (r) { await api.post(`/api/admin/events/${eventId}/executive-board`, r); b.reload(); } }}>+ Add</Btn>}</div>
      <DataTable rows={b.data ?? []} columns={[{ key: 'committee', label: 'Committee', render: (r: any) => r.committee ?? 'Secretariat' }, { key: 'position', label: 'Position' }, { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, ...(can('alloc.config') ? [{ key: 'x', label: '', sort: false, render: (r: any) => <button className="btn sm danger" onClick={async () => { await api.del(`/api/admin/executive-board/${r.id}`); b.reload(); }}>Remove</button> }] : [])]} />
    </div>
  );
}

export { inr };
