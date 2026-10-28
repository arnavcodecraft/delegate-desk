import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleAlert, CircleX, Loader2, Mail, RefreshCw } from 'lucide-react';
import { PlatformShell } from './Shell';

type Check = { name: string; state: 'ok' | 'warn' | 'bad' | 'wait'; detail: React.ReactNode };
const getJson = async (url: string) => {
  const r = await fetch(url, { headers: { 'x-dd': '1' }, credentials: 'same-origin' });
  const t = await r.text();
  try { return { status: r.status, json: JSON.parse(t) as any, html: false }; } catch { return { status: r.status, json: null, html: /<html|<!doctype/i.test(t) }; }
};

/** Setup check: is the website connected to the server, and is email ready? Shows how to fix each red line. */
export function SetupPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [to, setTo] = useState('');
  const [mailMsg, setMailMsg] = useState<string | null>(null);
  const run = async () => {
    const out: Check[] = [];
    setChecks([{ name: 'Checking…', state: 'wait', detail: '' }]);
    const pc = await getJson('/api/_proxy-check').catch(() => null);
    const health = await getJson('/api/health').catch(() => null);
    const onPages = !!pc?.json?.worker;
    if (onPages) out.push({ name: 'Cloudflare Pages worker', state: pc!.json.backendSet ? 'ok' : 'bad', detail: pc!.json.backendSet ? 'Running, with BACKEND_URL set.' : <>Running, but <b>BACKEND_URL</b> is not set. Cloudflare → your Pages project → Settings → Variables and Secrets → add BACKEND_URL (your server address, e.g. https://delegatedesk-api.onrender.com), then upload the site folder again.</> });
    else if (health?.json?.app === 'delegatedesk') out.push({ name: 'Hosting', state: 'ok', detail: 'The server is serving this site directly (not through Cloudflare Pages).' });
    else out.push({ name: 'Cloudflare Pages worker', state: 'bad', detail: <>The site is up but <b>_worker.js</b> is not running, so nothing reaches the server (this is what “Request failed (404)” means). Upload the whole <b>delegatedesk-site</b> folder, including <code>_worker.js</code>, as a new deployment.</> });
    if (health?.json?.app === 'delegatedesk') out.push({ name: 'DelegateDesk server', state: 'ok', detail: `Reachable, version ${health.json.version ?? 'unknown'}.` });
    else if (onPages && pc!.json.backendSet) out.push({ name: 'DelegateDesk server', state: 'bad', detail: health?.json?.error ?? 'Not reachable. Check that the server is running and that BACKEND_URL is its exact address (open it in a browser: /api/health should say ok).' });
    const st = health?.json?.app ? await getJson('/api/setup-status').catch(() => null) : null;
    const s = st?.json && st.json.app ? st.json : null;
    setStatus(s);
    if (s) {
      const origin = window.location.origin;
      out.push({ name: 'Server address (BASE_URL)', state: s.baseUrl === origin ? 'ok' : 'warn', detail: s.baseUrl === origin ? `Set to ${s.baseUrl}.` : <>The server thinks the site is at <b>{s.baseUrl}</b>, but you opened <b>{origin}</b>. Set <b>BASE_URL={origin}</b> on the server and restart it, or links in emails will point to the wrong place and sign-in may not stick.</> });
      out.push({ name: 'Email', state: s.mail.configured ? 'ok' : s.codesOnScreen ? 'warn' : 'bad', detail: s.mail.configured ? `Sending with ${s.mail.provider} as ${s.mail.from}.`
        : s.codesOnScreen ? 'No email service: codes are shown on screen (local use only).'
          : <>No email service, so sign-in codes, invitations and receipts cannot be sent. On the server, add <b>one</b> of: <code>RESEND_API_KEY</code> (resend.com, free), <code>BREVO_API_KEY</code> (brevo.com, free) or <code>SMTP_URL</code> (e.g. Gmail with an app password), plus <code>MAIL_FROM=Your Conference &lt;you@yourdomain.com&gt;</code>. Restart the server.</> });
      if (onPages) out.push({ name: 'Proxy secret', state: s.proxySecret && pc!.json.secretSet ? 'ok' : 'warn', detail: s.proxySecret && pc!.json.secretSet ? 'Set on both sides.' : 'Optional but recommended: set the same PROXY_SECRET in Cloudflare Pages and on the server, so the server only accepts traffic from your site.' });
      out.push({ name: 'AI (Prep research and drafting)', state: s.ai ? 'ok' : 'warn', detail: s.ai ? `On, using ${s.aiProvider === 'gemini' ? 'Google Gemini' : 'Claude'}.` : 'Off. Optional: add GEMINI_API_KEY (Google AI Studio) or ANTHROPIC_API_KEY on the server.' });
      const me = await getJson('/api/me').catch(() => null);
      out.push({ name: 'Accounts', state: me?.json && 'person' in me.json ? 'ok' : 'bad', detail: me?.json && 'person' in me.json ? 'Sign-up and sign-in are answering.' : 'The accounts service did not answer. The server may be an old version: deploy the latest DelegateDesk-server.zip.' });
    }
    setChecks(out);
  };
  useEffect(() => { run(); }, []);
  const Icon = { ok: CheckCircle2, warn: CircleAlert, bad: CircleX, wait: Loader2 };
  return (
    <PlatformShell>
      <div className="pf-narrow" style={{ maxWidth: 820 }}>
        <div className="pf-eyebrow">Site owner</div>
        <h1 className="pf-h1 left" style={{ fontSize: 34, marginTop: 8 }}>Setup check</h1>
        <p className="pf-sub left">Checks that this website is connected to the DelegateDesk server and that email works. Fix anything red, then check again.</p>
        <div className="pf-card" style={{ marginTop: 18, overflow: 'hidden' }}>
          {checks.map((c, i) => { const I = Icon[c.state]; return (
            <div key={i} className={`setup-row ${c.state}`}><I className={`icon ${c.state === 'wait' ? 'pp-rot' : ''}`} /><div><b>{c.name}</b><div className="pf-small pf-muted">{c.detail}</div></div></div>
          ); })}
        </div>
        <div className="mk-row" style={{ marginTop: 14 }}><button className="pf-btn ghost sm" onClick={run}><RefreshCw className="icon" />Check again</button><Link className="pf-btn link" to="/">Back to the site</Link></div>
        {status?.mail?.configured && <section className="pf-card pad" style={{ marginTop: 18 }}>
          <b><Mail className="icon pp-h-ic" /> Send a test email</b>
          <p className="pf-small pf-muted" style={{ margin: '4px 0 10px' }}>Organisers only: <Link to="/login?next=/setup">sign in</Link> first.</p>
          <form className="mk-row" onSubmit={async (e) => { e.preventDefault(); setMailMsg(null); const r = await fetch('/api/admin/test-email', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dd': '1' }, body: JSON.stringify({ to }) }); const d = await r.json().catch(() => ({})); setMailMsg(r.ok ? `Sent to ${d.to} with ${d.provider}. Check the inbox (and spam).` : d.error ?? `Failed (${r.status})`); }}>
            <input className="pf-input mk-select" type="email" placeholder="Send to (default: your email)" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="pf-btn primary sm">Send test</button>
          </form>
          {mailMsg && <div className="pf-note" style={{ marginTop: 10 }}><span>{mailMsg}</span></div>}
        </section>}
      </div>
    </PlatformShell>
  );
}
