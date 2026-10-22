import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, ScanLine } from 'lucide-react';
import { api } from '../api';
import { dt } from '../format';
import { DataTable, useAsync } from '../ui';
import { PageHead, useStaff } from './Shell';

type Result = { ok: boolean; name?: string; ref?: string; committee?: string; portfolio?: string; institution?: string; alreadyCheckedIn?: string | null; warnings?: string[]; error?: string; admitted?: boolean; reason?: string | null };

/** Desk and committee-door check-in: scan the badge QR with the camera or a USB scanner, or type the delegate ID. */
export default function CheckIn() {
  const { eventId } = useStaff();
  const stats = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/checkin/stats`), [eventId]);
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<(Result & { at: string })[]>([]);
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  async function submit(value: string) {
    const v = value.trim();
    if (!v) return;
    // Ignore the same badge held in front of the camera for a few seconds.
    if (last.current.code === v && Date.now() - last.current.at < 4000) return;
    last.current = { code: v, at: Date.now() };
    try {
      const r = await api.post<any>(`/api/admin/events/${eventId}/checkin`, { code: v });
      const res = { ok: true, ...r };
      setResult(res); setLog((l) => [{ ...res, at: new Date().toISOString() }, ...l].slice(0, 50));
      try { navigator.vibrate?.(60); } catch { /* not supported */ }
      stats.reload();
    } catch (e: any) {
      const res = { ok: false, error: e.message };
      setResult(res); setLog((l) => [{ ...res, ref: v, at: new Date().toISOString() }, ...l].slice(0, 50));
    }
    setCode('');
    input.current?.focus();
  }

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null; let raf = 0; let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (stopped) return;
        video.current!.srcObject = stream;
        await video.current!.play();
        const tick = () => {
          const v = video.current;
          if (v && v.readyState >= 2) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const qr = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
            if (qr?.data) submit(qr.data);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e: any) { setCamError(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow it in the browser, or use a USB scanner / type the ID.' : 'No camera is available on this device.'); setCamera(false); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = !result ? '' : !result.ok || result.admitted === false ? 'bad' : result.alreadyCheckedIn || result.warnings?.length ? 'warn' : 'ok';
  const totals = (stats.data ?? []).reduce((s, c) => ({ confirmed: s.confirmed + c.confirmed, present: s.present + c.present }), { confirmed: 0, present: 0 });
  return (
    <div className="stack">
      <PageHead title="Check-in" subtitle="Scan the QR on a delegate's badge or phone, or type their delegate ID. Each scan marks attendance and is logged.">
        <span className="badge info">{totals.present} of {totals.confirmed} present</span>
      </PageHead>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="card stack">
            <form className="row" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
              <div className="search-wrap" style={{ maxWidth: 'none' }}><ScanLine className="icon" /><input ref={input} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type a delegate ID, e.g. BGYS27-R-000124" aria-label="Badge code or delegate ID" /></div>
              <button className="btn primary">Check in</button>
            </form>
            <div className="row">
              <button className="btn" onClick={() => { setCamError(null); setCamera(!camera); }}>{camera ? <><CameraOff className="icon" />Stop camera</> : <><Camera className="icon" />Use camera</>}</button>
              <span className="small faint">USB barcode scanners work in the box above.</span>
            </div>
            {camError && <div className="alert warn"><AlertTriangle className="icon" /><div>{camError}</div></div>}
            {camera && <div className="scan-box"><video ref={video} playsInline muted /><div className="frame" /></div>}
          </div>
          {result && (
            <div className={`result-card ${tone}`} role="status" aria-live="assertive">
              {result.ok ? <>
                {result.admitted === false ? <XCircle className="icon lg" style={{ color: 'var(--bad)', width: 36, height: 36 }} /> : tone === 'ok' ? <CheckCircle2 className="icon lg" style={{ color: 'var(--good)', width: 36, height: 36 }} /> : <AlertTriangle className="icon lg" style={{ color: 'var(--warn)', width: 36, height: 36 }} />}
                <div className="hero-figure" style={{ fontSize: '1.7rem', margin: '.35rem 0' }}>{result.name}</div>
                <div style={{ fontWeight: 600 }}>{result.portfolio} · {result.committee}</div>
                <div className="small muted">{result.institution} · {result.ref}</div>
                {result.admitted === false && <div style={{ marginTop: '.5rem', fontWeight: 650, color: 'var(--bad)' }}>Not admitted: {result.reason}</div>}
                {result.alreadyCheckedIn && <div style={{ marginTop: '.5rem', fontWeight: 600 }}>Already checked in at {dt(result.alreadyCheckedIn)}</div>}
                {result.warnings?.map((w) => <div key={w} style={{ marginTop: '.35rem', fontWeight: 600, color: 'var(--warn)' }}>{w}</div>)}
              </> : <><XCircle className="icon lg" style={{ color: 'var(--bad)', width: 36, height: 36 }} /><div style={{ fontWeight: 650, marginTop: '.35rem' }}>{result.error}</div></>}
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card flush"><div className="card-head"><h3>By committee</h3></div>
            <DataTable rows={stats.data ?? []} columns={[{ key: 'name', label: 'Committee' }, { key: 'present', label: 'Present', num: true }, { key: 'confirmed', label: 'Confirmed', num: true }, { key: 'pct', label: '', num: true, sort: false, render: (c: any) => (c.confirmed ? `${Math.round((c.present / c.confirmed) * 100)}%` : '—') }]} />
          </div>
          <div className="card flush"><div className="card-head"><h3>This session</h3></div>
            <DataTable rows={log} rowKey={(r: any) => r.at + (r.ref ?? '')} empty="Scans appear here" columns={[{ key: 'at', label: 'Time', render: (r: any) => <span style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}</span> }, { key: 'name', label: 'Delegate', render: (r: any) => <span style={{ overflowWrap: 'anywhere' }}>{r.name ?? r.ref}{(!r.ok || r.admitted === false) && <div className="small faint">{r.error ?? r.reason}</div>}</span> }, { key: 'ok', label: 'Result', render: (r: any) => (!r.ok || r.admitted === false ? <span className="badge bad" title={r.reason ?? r.error}>Not admitted</span> : r.alreadyCheckedIn ? <span className="badge warn">Already in</span> : r.warnings?.length ? <span className="badge warn">{r.warnings[0]}</span> : <span className="badge good">Checked in</span>) }]} />
          </div>
        </div>
      </div>
    </div>
  );
}
