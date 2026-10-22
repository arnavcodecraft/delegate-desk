export function inr(paise: number | null | undefined, opts: { decimals?: boolean } = {}) {
  if (paise == null || Number.isNaN(paise)) return '—';
  const neg = paise < 0; const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100); const p = abs % 100;
  const s = rupees.toLocaleString('en-IN') + (opts.decimals || p ? '.' + String(p).padStart(2, '0') : '');
  return `${neg ? '−' : ''}₹${s}`;
}
/** Compact Indian notation for chart axes: ₹1.2L, ₹3.4Cr. */
export function inrShort(paise: number) {
  const r = paise / 100; const a = Math.abs(r);
  if (a >= 1e7) return `₹${(r / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(r / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(r / 1e3).toFixed(0)}k`;
  return `₹${Math.round(r)}`;
}
export const toPaise = (rupees: string | number) => { const n = Number(String(rupees).replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
export const toRupees = (paise: number | null | undefined) => (paise == null ? '' : String(paise / 100));
export function dt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
export function date(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00+05:30') : new Date(iso);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}
export function ago(iso: string | null | undefined) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const label = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
