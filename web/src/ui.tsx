import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from './api';
import { inr, inrShort, label } from './format';

// ---------- data loading ----------
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    fn().then((d) => { if (n === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (n === seq.current) setError(e); })
      .finally(() => { if (n === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

// ---------- toasts ----------
type Toast = { id: number; msg: string; kind?: 'bad' | 'ok' };
const ToastCtx = createContext<(msg: string, kind?: 'bad' | 'ok') => void>(() => {});
export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind?: 'bad' | 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'bad' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      <PromptHost>{children}</PromptHost>
      <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind ?? ''}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Run an action with a busy state; errors become toasts. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (ok) toast(ok, 'ok'); return r; }
    catch (e: any) { toast(e.message ?? 'Something went wrong', 'bad'); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

export function Btn({ onClick, children, kind, size, disabled, title, type, className }: { onClick?: () => any; children: React.ReactNode; kind?: 'primary' | 'danger' | 'good' | 'ghost'; size?: 'sm' | 'lg'; disabled?: boolean; title?: string; type?: 'button' | 'submit'; className?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button type={type ?? 'button'} title={title} className={`btn ${kind ?? ''} ${size ?? ''} ${className ?? ''}`} disabled={disabled || busy}
      onClick={onClick ? async () => { const r = onClick(); if (r && typeof r.then === 'function') { setBusy(true); try { await r; } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } } } : undefined}>
      {busy ? 'Working…' : children}
    </button>
  );
}

// ---------- prompt / confirm dialogs ----------
type PromptReq = { title: string; message?: string; fields?: { key: string; label: string; type?: string; value?: string; options?: { value: string; label: string }[]; required?: boolean; hint?: string }[]; confirm?: string; danger?: boolean; resolve: (v: Record<string, string> | null) => void };
const PromptCtx = createContext<(r: Omit<PromptReq, 'resolve'>) => Promise<Record<string, string> | null>>(async () => null);
function PromptHost({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<PromptReq | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const ask = useCallback((r: Omit<PromptReq, 'resolve'>) => new Promise<Record<string, string> | null>((resolve) => {
    setVals(Object.fromEntries((r.fields ?? []).map((f) => [f.key, f.value ?? (f.options?.[0]?.value ?? '')])));
    setReq({ ...r, resolve });
  }), []);
  const close = (v: Record<string, string> | null) => { req?.resolve(v); setReq(null); };
  const missing = (req?.fields ?? []).some((f) => f.required && !vals[f.key]?.trim());
  return (
    <PromptCtx.Provider value={ask}>
      {children}
      {req && (
        <Modal title={req.title} onClose={() => close(null)} footer={<><button className="btn" onClick={() => close(null)}>Cancel</button><button className={`btn ${req.danger ? 'danger' : 'primary'}`} disabled={missing} onClick={() => close(vals)}>{req.confirm ?? 'Confirm'}</button></>}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!missing) close(vals); }}>
            {req.message && <p className="muted">{req.message}</p>}
            {(req.fields ?? []).map((f, i) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                {f.options ? <select value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : f.type === 'textarea' ? <textarea autoFocus={i === 0} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                  : <input autoFocus={i === 0} type={f.type ?? 'text'} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />}
              </Field>
            ))}
            <button type="submit" hidden />
          </form>
        </Modal>
      )}
    </PromptCtx.Provider>
  );
}
export const usePrompt = () => useContext(PromptCtx);

// ---------- layout primitives ----------
export function Modal({ title, onClose, children, footer, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header><h2>{title}</h2><span className="spacer" /><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
export function Field({ label: l, hint, error, children }: { label: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return <label className="field"><span>{l}{hint && <> <span className="hint">{hint}</span></>}</span>{children}{error && <span className="err">{error}</span>}</label>;
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: React.ReactNode }[]; value: T; onChange: (k: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={t.key === value} className={t.key === value ? 'on' : ''} onClick={() => onChange(t.key)}>{t.label}</button>)}</div>;
}
export function Tile({ label: l, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'pos' | 'neg' }) {
  return <div className="tile"><div className="label">{l}</div><div className={`value ${tone ?? ''}`}>{value}</div>{sub && <div className="sub">{sub}</div>}</div>;
}
export function Loading({ what }: { what?: string }) { return <div className="empty">Loading{what ? ` ${what}` : ''}…</div>; }
export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return <div className="alert bad"><span className="icon">!</span><div><strong>{error.message}</strong>{retry && <div><button className="btn sm" onClick={retry}>Try again</button></div>}</div></div>;
}
export function Alert({ tone, children }: { tone?: 'good' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  const icon = tone === 'good' ? '✓' : tone === 'bad' ? '!' : tone === 'warn' ? '!' : 'i';
  return <div className={`alert ${tone ?? ''}`}><span className="icon" aria-hidden>{icon}</span><div>{children}</div></div>;
}

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | undefined> = {
  paid: 'good', confirmed: 'good', approved: 'good', processed: 'good', posted: 'good', sent: 'good', captured: 'good', verified: 'good', accrued: 'info', linked: 'good', committed: 'good',
  pending: 'warn', held: 'warn', submitted: 'info', processing: 'info', requested: 'warn', queued: 'info', draft: 'warn', part_paid: 'warn', part_refunded: 'warn', refund_requested: 'warn', unmatched: 'warn', waitlisted: 'info', unpaid: 'warn',
  failed: 'bad', rejected: 'bad', expired: 'bad', released: 'bad', bounced: 'bad', cancelled: 'bad', refunded: 'bad', suppressed: 'bad', excess: 'bad', resubmit: 'warn', rolled_back: 'bad',
};
export function Status({ value }: { value?: string | null }) {
  if (!value) return <span className="faint">—</span>;
  const tone = STATUS_TONE[value];
  return <span className={`badge ${tone ?? ''}`}><span className="dot" aria-hidden />{label(value)}</span>;
}
export const Money = ({ p, className }: { p: number | null | undefined; className?: string }) => <span className={`num ${className ?? ''}`}>{inr(p)}</span>;

// ---------- data table ----------
export interface Column<R> { key: string; label: React.ReactNode; render?: (r: R) => React.ReactNode; num?: boolean; sort?: boolean; sortValue?: (r: R) => any; width?: string }
export function DataTable<R extends Record<string, any>>({ columns, rows, onRowClick, rowKey, selectable, selected, onSelect, empty, foot, maxHeight }: {
  columns: Column<R>[]; rows: R[]; onRowClick?: (r: R) => void; rowKey?: (r: R) => string; selectable?: boolean; selected?: Set<string>; onSelect?: (s: Set<string>) => void; empty?: React.ReactNode; foot?: React.ReactNode; maxHeight?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const key = rowKey ?? ((r: R) => r.id ?? r.ref ?? JSON.stringify(r));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const v = (r: R) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (x == null ? -Infinity : x) > (y == null ? -Infinity : y) ? sort.dir : (x ?? -Infinity) < (y ?? -Infinity) ? -sort.dir : 0; });
  }, [rows, sort, columns]);
  const [limit, setLimit] = useState(200);
  const shown = sorted.slice(0, limit);
  const allOn = selectable && rows.length > 0 && rows.every((r) => selected?.has(key(r)));
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="t">
        <thead><tr>
          {selectable && <th style={{ width: 32 }}><input type="checkbox" aria-label="Select all" checked={!!allOn} onChange={() => onSelect?.(allOn ? new Set() : new Set(rows.map(key)))} /></th>}
          {columns.map((c) => (
            <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort !== false ? 'sortable' : ''}`} style={c.width ? { width: c.width } : undefined}
              onClick={() => c.sort !== false && setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
              {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {shown.map((r) => {
            const k = key(r);
            return (
              <tr key={k} className={`${onRowClick ? 'clickable' : ''} ${selected?.has(k) ? 'selected' : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {selectable && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={!!selected?.has(k)} onChange={() => { const s = new Set(selected); s.has(k) ? s.delete(k) : s.add(k); onSelect?.(s); }} /></td>}
                {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : fmtCell(r[c.key], c.key)}</td>)}
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={columns.length + (selectable ? 1 : 0)}><div className="empty">{empty ?? 'Nothing here yet.'}</div></td></tr>}
        </tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
      {sorted.length > limit && <div className="empty"><button className="btn sm" onClick={() => setLimit(limit + 500)}>Show more ({sorted.length - limit} more rows)</button></div>}
    </div>
  );
}
function fmtCell(v: any, key: string) {
  if (v == null || v === '') return <span className="faint">—</span>;
  if (key === 'ref' || key === 'number') return <span className="nowrap">{String(v)}</span>;
  if (typeof v === 'number' && /paise|amount|_due|total|balance|commission|revenue|fees|earned|paid_out/.test(key)) return inr(v);
  if (/status|state$/.test(key) && typeof v === 'string') return <Status value={v} />;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return String(v);
}

// ---------- charts (SVG; validated reference palette; hover tooltips; one axis) ----------
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  return { tip, setTip, node: tip && <div className="tip" style={{ left: Math.min(tip.x + 12, 9999), top: tip.y - 10 }}>{tip.html}</div> };
}
const niceMax = (v: number) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** Single-series column chart with per-bar hover. */
export function BarChart({ data, height = 180, money, ariaLabel }: { data: { x: string; y: number; note?: string }[]; height?: number; money?: boolean; ariaLabel: string }) {
  const { setTip, node } = useTip();
  const W = 640, H = height, L = 40, B = 22, T = 8;
  const max = niceMax(Math.max(1, ...data.map((d) => d.y)));
  const bw = data.length ? (W - L) / data.length : 0;
  const fmt = (v: number) => (money ? inrShort(v) : String(Math.round(v)));
  if (!data.length) return <div className="empty">No data yet.</div>;
  return (
    <div className="viz" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {[0, 0.5, 1].map((f) => <g key={f} className="axis"><line className="gridline" x1={L} x2={W} y1={T + (H - T - B) * (1 - f)} y2={T + (H - T - B) * (1 - f)} /><text x={L - 6} y={T + (H - T - B) * (1 - f) + 4} textAnchor="end">{fmt(max * f)}</text></g>)}
        {data.map((d, i) => {
          const h = ((H - T - B) * d.y) / max; const w = Math.max(2, Math.min(48, bw - 2)); const x = L + i * bw + (bw - w) / 2;
          return (
            <g key={d.x} onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, html: <><strong>{d.x}</strong><br />{money ? inr(d.y) : d.y}{d.note ? ` · ${d.note}` : ''}</> }); }}>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              <path d={`M${x},${H - B} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${Math.max(0, w - 8)} q4,0 4,4 v${Math.max(0, h - 4)} z`} fill="var(--series-1)" />
            </g>
          );
        })}
        <g className="axis">{data.filter((_, i) => i % Math.ceil(data.length / 8) === 0).map((d) => { const i = data.indexOf(d); return <text key={d.x} x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle">{d.x.slice(5)}</text>; })}</g>
      </svg>
      {node}
    </div>
  );
}

/** Multi-series line chart with a crosshair tooltip. All series share one money axis. */
export function LineChart({ series, height = 220, ariaLabel }: { series: { name: string; color: string; dashed?: boolean; points: { x: string; y: number }[] }[]; height?: number; ariaLabel: string }) {
  const { setTip, node } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 52, B = 22, T = 10;
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  if (xs.length < 1) return <div className="empty">No data yet.</div>;
  const all = series.flatMap((s) => s.points.map((p) => p.y));
  const max = niceMax(Math.max(1, ...all)); const min = Math.min(0, ...all);
  const sx = (i: number) => L + (xs.length === 1 ? (W - L) / 2 : (i * (W - L - 6)) / (xs.length - 1));
  const sy = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min));
  return (
    <div>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i className={s.dashed ? 'dash' : 'line'} style={{ background: s.color, borderColor: s.color }} />{s.name}</span>)}</div>}
      <div className="viz" onMouseLeave={() => { setTip(null); setHover(null); }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - L) / (W - L - 6)) * (xs.length - 1))));
            setHover(i);
            setTip({ x: e.clientX - r.left, y: e.clientY - r.top, html: <><strong>{xs[i]}</strong>{series.map((s) => { const p = s.points.find((q) => q.x === xs[i]); return p ? <div key={s.name}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 4 }} />{s.name}: {inr(p.y)}</div> : null; })}</> });
          }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = min + (max - min) * f; return <g key={f} className="axis"><line className="gridline" x1={L} x2={W} y1={sy(v)} y2={sy(v)} /><text x={L - 6} y={sy(v) + 4} textAnchor="end">{inrShort(v)}</text></g>; })}
          {series.map((s) => {
            const pts = s.points.map((p) => [sx(xs.indexOf(p.x)), sy(p.y)] as const);
            return <path key={s.name} d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />;
          })}
          {series.map((s) => { const last = s.points[s.points.length - 1]; return last && !s.dashed ? <circle key={s.name} cx={sx(xs.indexOf(last.x))} cy={sy(last.y)} r={4} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} /> : null; })}
          {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={T} y2={H - B} stroke="var(--border-strong)" strokeWidth={1} />}
          <g className="axis">{xs.filter((_, i) => i % Math.ceil(xs.length / 7) === 0).map((x) => <text key={x} x={sx(xs.indexOf(x))} y={H - 6} textAnchor="middle">{x.slice(5)}</text>)}</g>
        </svg>
        {node}
      </div>
    </div>
  );
}

/** Horizontal progress bars (budget vs actual); status colour only when over budget, with a text label. */
export function BudgetBars({ rows }: { rows: { category: string; budget: number; used: number }[] }) {
  if (!rows.length) return <div className="empty">No budgets set.</div>;
  return (
    <div>
      {rows.map((r) => {
        const pct = r.budget ? (r.used / r.budget) * 100 : 100;
        const over = r.budget > 0 && r.used > r.budget;
        return (
          <div key={r.category} className="bar-row" title={`${label(r.category)}: ${inr(r.used)} of ${inr(r.budget)}`}>
            <span>{label(r.category)}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: over ? 'var(--status-critical)' : pct >= 80 ? 'var(--status-warning)' : 'var(--series-1)' }} /></div>
            <span className="num">{r.budget ? `${Math.round(pct)}%` : 'no budget'}{over ? ' · over' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Suggest({ value, onChange, fetcher, placeholder, id, invalid, autoComplete, onPick }: { value: string; onChange: (v: string) => void; fetcher: (q: string) => Promise<string[]>; placeholder?: string; id?: string; invalid?: boolean; autoComplete?: string; onPick?: (v: string) => void }) {
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (value.trim().length < 2) { setItems([]); return; }
    const t = setTimeout(() => fetcher(value).then(setItems).catch(() => setItems([])), 180);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: string) => { onChange(v); onPick?.(v); setOpen(false); };
  const visible = open && items.length > 0 && !(items.length === 1 && items[0] === value);
  return (
    <div className="suggest">
      <input id={id} value={value} placeholder={placeholder} className={invalid ? 'invalid' : ''} autoComplete={autoComplete ?? 'off'}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
        }} />
      {visible && <ul role="listbox">{items.map((it, i) => <li key={it} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={() => pick(it)}>{it}</li>)}</ul>}
    </div>
  );
}

export function downloadUrl(url: string) {
  const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}
