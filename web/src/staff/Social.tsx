import { useState } from 'react';
import { Check, Copy, Link2, Megaphone, Plus, Trash2, Pencil } from 'lucide-react';
import { api } from '../api';
import { dt } from '../format';
import { Alert, Btn, DataTable, Field, Loading, Modal, Segmented, useAsync, useToast } from '../ui';
import { PageHead, useStaff } from './Shell';

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1300); } catch { /* blocked */ } }}>{ok ? <Check className="icon" /> : <Copy className="icon" />}{ok ? 'Copied' : label}</button>;
}

/** Social media: tracked links per platform and campaign, what each brought in, captions and a post planner. */
export function SocialDashboard() {
  const { eventId } = useStaff();
  const d = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/social`), [eventId]);
  const [tab, setTab] = useState<'results' | 'captions' | 'planner'>('results');
  const [post, setPost] = useState<any>(null);
  const [campaign, setCampaign] = useState('');
  const [made, setMade] = useState<{ tag: string; page: string; register: string } | null>(null);
  const toast = useToast();
  if (!d.data) return <Loading />;
  const x = d.data;
  const max = Math.max(1, ...x.series.map((s: any) => s.visits));
  const totals = x.rows.reduce((t: any, r: any) => ({ visits: t.visits + r.visits, applied: t.applied + r.applied, paid: t.paid + r.paid }), { visits: 0, applied: 0, paid: 0 });
  const withSrc = (u: string, src: string) => `${u}${u.includes('?') ? '&' : '?'}src=${src}`;
  return (
    <div className="stack">
      <PageHead title="Social media" subtitle="Share a tracked link on each platform, and see which one brings visits, applications and paid delegates. Captions are written from your conference's details." />
      <div className="db-tiles">
        <div className="db-tile hero"><span className="db-tile-k">Page visits</span><b className="db-tile-v">{totals.visits}</b><span className="db-tile-sub">all sources</span></div>
        <div className="db-tile"><span className="db-tile-k">Applications</span><b className="db-tile-v">{totals.applied}</b><span className="db-tile-sub">{totals.visits ? `${Math.round((totals.applied / totals.visits) * 100)}% of visits` : 'share a link to start'}</span></div>
        <div className="db-tile"><span className="db-tile-k">Paid</span><b className="db-tile-v">{totals.paid}</b><span className="db-tile-sub">confirmed delegates</span></div>
        <div className="db-tile"><span className="db-tile-k">Planned posts</span><b className="db-tile-v">{x.posts.filter((p: any) => p.status !== 'posted').length}</b><span className="db-tile-sub">{x.posts.filter((p: any) => p.status === 'posted').length} posted</span></div>
      </div>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'results', label: 'Links & results' }, { value: 'captions', label: 'Captions' }, { value: 'planner', label: `Post planner${x.posts.length ? ` (${x.posts.length})` : ''}` }]} />

      {tab === 'results' && <>
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Page visits, last 14 days</h3><span className="small muted">{x.series.reduce((t: number, s: any) => t + s.visits, 0)} visits</span></div>
          <div className="sm-bars" role="img" aria-label={`Visits per day: ${x.series.map((s: any) => s.visits).join(', ')}`}>{x.series.map((s: any) => <div key={s.day} title={`${s.day}: ${s.visits} visits`}><i style={{ height: `${Math.max(4, (s.visits / max) * 100)}%` }} className={s.visits ? '' : 'zero'} /><span>{new Date(s.day).getDate()}</span></div>)}</div>
        </div>
        <div className="card flush"><DataTable rows={x.rows.filter((r: any) => r.tracked || r.visits || r.applied)} empty="No data yet" columns={[
          { key: 'label', label: 'Source', render: (r: any) => <b>{r.label}</b> },
          { key: 'visits', label: 'Visits', num: true }, { key: 'applied', label: 'Applied', num: true }, { key: 'paid', label: 'Paid', num: true },
          { key: 'conversion', label: 'Visits → applied', num: true, render: (r: any) => r.conversion == null ? '—' : `${r.conversion}%` },
          { key: 'act', label: 'Tracked link', sort: false, render: (r: any) => r.pageLink ? <span className="row" style={{ flexWrap: 'nowrap' }}><CopyBtn text={r.pageLink} label="Page" /><CopyBtn text={r.registerLink} label="Form" /></span> : <span className="small faint">not tracked</span> },
        ]} /></div>
        <div className="card stack">
          <h3 style={{ margin: 0 }}><Megaphone className="icon" /> Campaign link</h3>
          <p className="small muted" style={{ margin: 0 }}>Running a specific push, like an early-bird week or a school roadshow? Name it to get its own links, and it gets its own row above.</p>
          <form className="row" onSubmit={async (e) => { e.preventDefault(); try { const r = await api.post<any>(`/api/admin/events/${eventId}/social/campaign`, { name: campaign }); setMade({ tag: r.tag, page: withSrc(x.page, r.tag), register: withSrc(x.register, r.tag) }); } catch (er: any) { toast(er.message, 'bad'); } }}>
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Early bird week" style={{ flex: 1, minWidth: 220 }} aria-label="Campaign name" />
            <Btn kind="primary" icon={Link2}>Make links</Btn>
          </form>
          {made && <div className="stack tight"><div className="row"><code className="mono small sm-link">{made.page}</code><CopyBtn text={made.page} label="Page link" /></div><div className="row"><code className="mono small sm-link">{made.register}</code><CopyBtn text={made.register} label="Form link" /></div></div>}
        </div>
        {!Object.values(x.socials ?? {}).some(Boolean) && <Alert tone="info">Add your Instagram, WhatsApp and other handles on the <a href="/app/conference">Conference page</a> so delegates can find you.</Alert>}
      </>}

      {tab === 'captions' && <div className="sm-captions">{x.captions.map((c: any) => (
        <div key={c.key} className="card stack tight">
          <b>{c.title}</b>
          <div className="sm-caption">{c.text}</div>
          <div className="row"><CopyBtn text={c.text} /><Btn size="sm" icon={Plus} onClick={() => { setPost({ platform: 'instagram', caption: c.text, status: 'draft', scheduled_for: '', link: '' }); setTab('planner'); }}>Plan this post</Btn></div>
        </div>))}</div>}

      {tab === 'planner' && <>
        <div><Btn kind="primary" icon={Plus} onClick={() => setPost({ platform: 'instagram', caption: '', status: 'draft', scheduled_for: '', link: '' })}>Plan a post</Btn></div>
        {!x.posts.length ? <div className="card"><p className="muted" style={{ margin: 0 }}>No posts planned. Start from a caption, or plan your own.</p></div>
          : <div className="card flush"><DataTable rows={x.posts} columns={[
            { key: 'scheduled_for', label: 'When', render: (p: any) => p.scheduled_for ? dt(p.scheduled_for) : <span className="faint">No date</span> },
            { key: 'platform', label: 'Platform', render: (p: any) => x.platforms[p.platform] ?? p.platform },
            { key: 'caption', label: 'Caption', sort: false, render: (p: any) => <span className="small" title={p.caption}>{p.caption.slice(0, 90)}{p.caption.length > 90 ? '…' : ''}</span> },
            { key: 'status', label: 'Status', render: (p: any) => <span className={`badge ${p.status === 'posted' ? 'good' : p.status === 'scheduled' ? 'info' : ''}`}>{p.status === 'posted' ? 'Posted' : p.status === 'scheduled' ? 'Scheduled' : 'Draft'}</span> },
            { key: 'act', label: '', sort: false, render: (p: any) => <span className="row" style={{ flexWrap: 'nowrap' }}>
              {p.status !== 'posted' && <Btn size="sm" onClick={async () => { await api.patch(`/api/admin/events/${eventId}/social/posts/${p.id}`, { ...p, status: 'posted' }); d.reload(); }}>Mark posted</Btn>}
              <button className="btn sm ghost icon-only" aria-label="Edit" onClick={() => setPost({ ...p, scheduled_for: p.scheduled_for ? p.scheduled_for.slice(0, 16) : '' })}><Pencil className="icon" /></button>
              <button className="btn sm ghost icon-only" aria-label="Delete" onClick={async () => { if (confirm('Delete this post?')) { await api.del(`/api/admin/events/${eventId}/social/posts/${p.id}`); d.reload(); } }}><Trash2 className="icon" /></button></span> },
          ]} /></div>}
      </>}
      {post && <PostForm post={post} platforms={x.platforms} onClose={() => setPost(null)} onSave={async (p) => {
        try {
          const body = { ...p, scheduled_for: p.scheduled_for ? new Date(p.scheduled_for).toISOString() : null };
          if (p.id) await api.patch(`/api/admin/events/${eventId}/social/posts/${p.id}`, body); else await api.post(`/api/admin/events/${eventId}/social/posts`, body);
          setPost(null); toast('Saved', 'ok'); d.reload();
        } catch (e: any) { toast(e.message, 'bad'); }
      }} />}
    </div>
  );
}

function PostForm({ post, platforms, onClose, onSave }: { post: any; platforms: Record<string, string>; onClose: () => void; onSave: (p: any) => void }) {
  const [f, setF] = useState(post);
  return (
    <Modal title={post.id ? 'Edit post' : 'Plan a post'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={() => onSave(f)}>Save</Btn></>}>
      <div className="stack">
        <div className="grid g2">
          <Field label="Platform"><select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>{Object.entries(platforms).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="When" hint="optional"><input type="datetime-local" value={f.scheduled_for ?? ''} onChange={(e) => setF({ ...f, scheduled_for: e.target.value })} /></Field>
        </div>
        <Field label="Caption"><textarea rows={8} maxLength={2200} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
        <div className="grid g2">
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="posted">Posted</option></select></Field>
          <Field label="Link to the post" hint="optional, once it is live"><input value={f.link ?? ''} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://instagram.com/p/…" /></Field>
        </div>
      </div>
    </Modal>
  );
}
