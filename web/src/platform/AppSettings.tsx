import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Server, Smartphone } from 'lucide-react';
import { PlatformShell } from './Shell';
import { nativeApp, normaliseServer, saveServer, serverUrl } from '../native';

/** In the apps: which DelegateDesk server to use (the home page, Prep and the Masterclass work without one). */
export function AppSettingsPage() {
  const [v, setV] = useState(serverUrl());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.dd?.server?.().then((u) => u && setV(u)).catch(() => {}); }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = normaliseServer(v);
    if (url === null) { setMsg({ ok: false, text: 'Enter a full address starting with https://' }); return; }
    setBusy(true); setMsg(null);
    try {
      if (nativeApp === 'desktop') {
        // The desktop app passes server calls on itself: save first, then check through it.
        saveServer(url);
        if (url) { await new Promise((r) => setTimeout(r, 150)); const d = await (await fetch('/api/health')).json(); if (d.app !== 'delegatedesk') throw new Error(); }
      } else {
        if (url) { const r = await fetch(`${url}/api/health`); const d = await r.json(); if (d.app !== 'delegatedesk') throw new Error(); }
        saveServer(url);
      }
      setMsg({ ok: true, text: url ? 'Connected. Sign-in, conferences and live sessions now use this server.' : 'Server address removed.' });
    } catch { setMsg({ ok: false, text: 'No DelegateDesk server answered at that address. Check it and try again.' }); }
    finally { setBusy(false); }
  };
  return (
    <PlatformShell>
      <div className="pf-narrow" style={{ maxWidth: 560, margin: '20px auto' }}>
        <div className="pf-eyebrow"><Smartphone className="icon" style={{ width: 14, height: 14, verticalAlign: -2 }} /> {nativeApp ? 'This app' : 'Apps'}</div>
        <h1 className="pf-h1 left" style={{ fontSize: 34, marginTop: 8 }}>App settings</h1>
        <p className="pf-sub left">The home page, Prep and the Masterclass work right away. To sign in, register for conferences or join live sessions, connect the app to your DelegateDesk server.</p>
        <form className="pf-card pad" onSubmit={save} style={{ marginTop: 18 }}>
          <label className="pf-field"><span className="pf-label"><Server className="icon" style={{ width: 15, height: 15, verticalAlign: -2 }} /> Server address</span>
            <input className="pf-input" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://your-delegatedesk-site.com" inputMode="url" autoCapitalize="off" autoCorrect="off" /></label>
          {msg && <div className={msg.ok ? 'pf-note green' : 'pf-err'} role="status" style={{ marginBottom: 12 }}>{msg.ok && <Check className="icon" />}<span>{msg.text}</span></div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="pf-btn primary" disabled={busy}>{busy ? 'Checking…' : 'Save'}</button><Link className="pf-btn ghost" to="/">Back to home</Link></div>
        </form>
      </div>
    </PlatformShell>
  );
}
