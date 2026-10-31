import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ExternalLink, Lock, Sparkles } from 'lucide-react';
import { api } from '../api';
import { PlatformShell, usePerson } from '../platform/Shell';

export interface PrepMeta {
  ai: boolean; aiLeft: number | null; aiLimit: number; templates: { key: string; label: string; tasks: string[] }[]; tasks: { key: string; label: string }[];
  practice: { key: string; label: string }[]; speechTypes: { key: string; label: string; seconds: number; sections: [string, number][] }[]; paperSections: [string, number][]; wpm: number;
  progress: { done: Record<string, number | null>; streak: number; today: boolean } | null;
}
let metaCache: PrepMeta | null = null;
export function usePrepMeta() {
  const [m, setM] = useState<PrepMeta | null>(metaCache);
  const load = () => api.get<PrepMeta>('/api/prep/meta').then((x) => { metaCache = x; setM(x); }).catch(() => {});
  useEffect(() => { load(); window.addEventListener('dd:me', load); window.addEventListener('dd:prep', load); return () => { window.removeEventListener('dd:me', load); window.removeEventListener('dd:prep', load); }; }, []);
  return m;
}
export const refreshPrep = () => window.dispatchEvent(new Event('dd:prep'));

const NAV: [string, string][] = [['/prep', 'Overview'], ['/prep/research', 'Research'], ['/prep/write', 'Write'], ['/prep/coach', 'Coach'], ['/prep/practice', 'Practice'], ['/prep/learn', 'Learn'], ['/prep/videos', 'Videos'], ['/prep/discover', 'Discover'], ['/prep/countries', 'Countries'], ['/prep/tools', 'Tools']];
export function PrepShell({ children, title, subtitle, actions }: { children: React.ReactNode; title?: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <PlatformShell>
      <nav className="pp-nav" aria-label="Prep">{NAV.map(([to, l]) => <NavLink key={to} to={to} end={to === '/prep'}>{l}</NavLink>)}</nav>
      {title && <div className="pf-pagehead pp-head"><div><h1 className="pf-h1 left">{title}</h1>{subtitle && <p className="pf-sub left">{subtitle}</p>}</div>{actions && <div className="pp-actions">{actions}</div>}</div>}
      {children}
    </PlatformShell>
  );
}

/** Things that need an account show a sign-in card instead. */
export function NeedsAccount({ children, what }: { children: React.ReactNode; what: string }) {
  const me = usePerson();
  if (!me) return <div className="pf-empty">Loading…</div>;
  if (!me.person) return (
    <div className="pf-card pad pp-gate"><Lock className="icon" />
      <div style={{ flex: 1 }}><b>Sign in to {what}</b><div className="pf-small pf-muted">A free DelegateDesk account keeps your work, sources and progress, and lets you share projects with your team.</div></div>
      <Link className="pf-btn primary sm" to={`/account?mode=signup&next=${encodeURIComponent(location.pathname)}`}>Create free account</Link><Link className="pf-btn ghost sm" to={`/account?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link>
    </div>
  );
  return <>{children}</>;
}
export function AiBadge({ meta }: { meta: PrepMeta | null }) {
  if (!meta) return null;
  if (!meta.ai) return <span className="pf-tag" title="The site owner has not added an AI key yet">AI off on this site</span>;
  return <span className="pf-tag blue"><Sparkles className="icon" style={{ width: 12, height: 12 }} />{meta.aiLeft ?? meta.aiLimit} AI requests left today</span>;
}

// ---------- a small, safe Markdown renderer (headings, lists, bold, italics, links, tables, citations) ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s: string) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/\[(\d{1,2})\]/g, '<sup class="pp-cite">$1</sup>');
}
export function markdown(src: string) {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  const out: string[] = []; let list: 'ul' | 'ol' | null = null; let table: string[][] | null = null;
  let quote: string[] | null = null;
  const closeQuote = () => { if (quote) { out.push(`<blockquote>${quote.join('')}</blockquote>`); quote = null; } };
  const closeList = () => { closeQuote(); if (list) { out.push(`</${list}>`); list = null; } };
  const closeTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
    out.push(`<div class="pp-table"><table><thead><tr>${rows[0].map((c) => `<th>${inline(c.trim())}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c.trim())}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    table = null;
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(l)) { closeList(); (table ??= []).push(l.trim().slice(1, -1).split('|')); continue; } else closeTable();
    let m: RegExpMatchArray | null;
    if (!l.trim()) { closeList(); continue; }
    // "> text" quotes; extra spaces after ">" indent the line (used for resolution sub-clauses).
    if ((m = l.match(/^\s*>( *)(.*)/))) { if (list) closeList(); (quote ??= []).push(`<div style="padding-left:${Math.max(0, m[1].length - 1) * 0.6}em">${inline(m[2])}</div>`); continue; } else closeQuote();
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { closeList(); const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { closeList(); out.push('<hr />'); continue; }
    closeList(); out.push(`<p>${inline(l)}</p>`);
  }
  closeList(); closeTable();
  return out.join('');
}
export function Markdown({ text }: { text: string }) {
  return <div className="pp-md" dangerouslySetInnerHTML={{ __html: markdown(text) }} />;
}
export function Sources({ sources }: { sources?: { url: string; title: string; quote?: string }[] }) {
  if (!sources?.length) return null;
  return (
    <div className="pp-sources"><div className="pf-mini">Sources</div>
      <ol>{sources.map((s, i) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}<ExternalLink className="icon" /></a><span className="pf-faint pf-small">{new URL(s.url).hostname.replace(/^www\./, '')}</span>{s.quote && <blockquote>“{s.quote}”</blockquote>}</li>)}</ol>
    </div>
  );
}
export function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return <button className="pf-btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* blocked */ } }}>{ok ? 'Copied' : label}</button>;
}
export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="pf-note" role="alert" style={{ background: 'var(--pf-red-soft)', color: 'var(--pf-red)', margin: '10px 0' }}><span>{error}</span></div>;
}
export function Busy({ label }: { label: string }) {
  return <div className="pp-busy"><span className="pp-spin" />{label}</div>;
}
