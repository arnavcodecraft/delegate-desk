import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Hand, Users, PhoneOff, Minimize2, Maximize2, X, VolumeX, UserMinus, Loader2, Phone, ShieldAlert } from 'lucide-react';
import { api } from '../api';

interface PeerInfo { pid: string; who: string; name: string; staff: boolean; seq: number; mic: boolean; cam: boolean; screen: boolean; hand: boolean }
interface Conn { pc: RTCPeerConnection; stream: MediaStream; ice: RTCIceCandidateInit[]; ready: boolean }
export interface CallTarget { key: string; title: string; kind: 'audio' | 'video' }

const initials = (n: string) => n.replace(/\(.*?\)/g, '').split(/[\s·]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** How loud a stream is right now (0–1), for the speaking ring. */
function useLevel(stream: MediaStream | null, on: boolean) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !on || !stream.getAudioTracks().length) { setLevel(0); return; }
    let ctx: AudioContext | null = null; let t: any;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      t = setInterval(() => { an.getByteFrequencyData(buf); let sum = 0; for (const v of buf) sum += v; setLevel(Math.min(1, sum / buf.length / 60)); }, 250);
    } catch { /* no audio analysis on this browser */ }
    return () => { clearInterval(t); ctx?.close().catch(() => {}); };
  }, [stream, on, stream?.getAudioTracks().length]);
  return level;
}

function Tile({ name, stream, video, mic, hand, screen, me, staff, big }: { name: string; stream: MediaStream | null; video: boolean; mic: boolean; hand: boolean; screen?: boolean; me?: boolean; staff?: boolean; big?: boolean }) {
  const v = useRef<HTMLVideoElement>(null);
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (v.current && v.current.srcObject !== stream) v.current.srcObject = stream; if (a.current && !me && a.current.srcObject !== stream) { a.current.srcObject = stream; a.current.play().catch(() => {}); } }, [stream, me]);
  const level = useLevel(stream, mic);
  return (
    <div className={`call-tile ${level > 0.12 ? 'speaking' : ''} ${big ? 'big' : ''} ${screen ? 'screen' : ''}`}>
      <video ref={v} autoPlay playsInline muted style={{ display: video ? 'block' : 'none', transform: me && !screen ? 'scaleX(-1)' : undefined }} />
      {!me && <audio ref={a} autoPlay />}
      {!video && <div className="call-av"><span className={staff ? 'staff' : ''}>{initials(name)}</span></div>}
      <div className="call-name">{!mic && <MicOff size={13} />}{screen && <MonitorUp size={13} />}<span>{me ? `${name} (you)` : name}</span></div>
      {hand && <div className="call-hand" aria-label="Hand raised"><Hand size={16} /></div>}
    </div>
  );
}

/**
 * A call or online meeting (WebRTC, peer to peer). Opens on a preview where you choose camera and microphone,
 * then shows everyone in a grid with controls for mic, camera, screen sharing, raising your hand, and the people list.
 */
export function CallRoom({ base, target, onClose }: { base: string; target: CallTarget; onClose: () => void }) {
  const [phase, setPhase] = useState<'lobby' | 'joining' | 'in' | 'ended'>('lobby');
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(target.kind === 'video');
  const [screen, setScreen] = useState(false);
  const [hand, setHand] = useState(false);
  const [mini, setMini] = useState(false);
  const [panel, setPanel] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [host, setHost] = useState(false);
  const [, force] = useState(0);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(Date.now());
  const local = useRef<MediaStream>(new MediaStream());
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const conns = useRef(new Map<string, Conn>());
  const me = useRef<{ pid: string; seq: number; ice: RTCIceServer[] } | null>(null);
  const state = useRef({ mic, cam, screen, hand });
  state.current = { mic, cam, screen, hand };
  const post = (path: string, body: any) => api.post<any>(`${base}/${path}`, { key: target.key, ...body });

  // ---- local media ----
  const rebuildLocal = () => { const s = new MediaStream(); for (const t of [micTrack.current, screenTrack.current ?? camTrack.current]) if (t) s.addTrack(t); local.current = s; force((n) => n + 1); };
  const videoTrack = () => screenTrack.current ?? camTrack.current;
  const pushVideo = () => { for (const c of conns.current.values()) c.pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender.replaceTrack(videoTrack()).catch(() => {}); };
  const getCam = async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20 } } }); camTrack.current = s.getVideoTracks()[0]; return true; }
    catch { setNotice('Your camera isn’t available. Check that no other app is using it and that this site may use it.'); return false; }
  };
  const getMic = async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); micTrack.current = s.getAudioTracks()[0]; micTrack.current.enabled = state.current.mic; return true; }
    catch { setNotice('Your microphone isn’t available, so you joined to listen. Check this site’s microphone permission.'); setMic(false); return false; }
  };
  useEffect(() => { // the preview
    let gone = false;
    (async () => { await getMic(); if (target.kind === 'video') { const ok = await getCam(); if (!ok) setCam(false); } if (!gone) rebuildLocal(); })();
    return () => { gone = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stopAll = () => { for (const t of [camTrack.current, micTrack.current, screenTrack.current]) t?.stop(); camTrack.current = micTrack.current = screenTrack.current = null; for (const c of conns.current.values()) c.pc.close(); conns.current.clear(); };
  useEffect(() => () => { stopAll(); if (me.current) navigator.sendBeacon?.(`${base}/leave`, new Blob([JSON.stringify({ key: target.key, pid: me.current.pid })], { type: 'application/json' })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMic = async () => { if (!micTrack.current) { if (!(await getMic())) return; rebuildLocal(); for (const c of conns.current.values()) c.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio')?.sender.replaceTrack(micTrack.current).catch(() => {}); } const on = !mic; if (micTrack.current) micTrack.current.enabled = on; setMic(on); };
  const toggleCam = async () => {
    if (cam) { camTrack.current?.stop(); camTrack.current = null; setCam(false); }
    else { if (!(await getCam())) return; setCam(true); }
    rebuildLocal(); if (!screenTrack.current) pushVideo();
  };
  const toggleScreen = async () => {
    if (screen) { screenTrack.current?.stop(); screenTrack.current = null; setScreen(false); rebuildLocal(); pushVideo(); return; }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 10 } }, audio: false });
      screenTrack.current = s.getVideoTracks()[0];
      screenTrack.current.onended = () => { screenTrack.current = null; setScreen(false); rebuildLocal(); pushVideo(); };
      setScreen(true); rebuildLocal(); pushVideo();
    } catch { /* cancelled */ }
  };

  // ---- connections ----
  const signal = (to: string, type: string, data: unknown) => post('signal', { pid: me.current!.pid, to, type, data }).catch(() => {});
  const makeConn = (pid: string, offerer: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: me.current!.ice });
    const c: Conn = { pc, stream: new MediaStream(), ice: [], ready: false };
    pc.ontrack = (e) => { if (!c.stream.getTracks().includes(e.track)) c.stream.addTrack(e.track); c.stream = new MediaStream(c.stream.getTracks()); force((n) => n + 1); };
    pc.onicecandidate = (e) => { if (e.candidate) signal(pid, 'ice', e.candidate.toJSON()); };
    pc.onconnectionstatechange = () => { force((n) => n + 1); if (pc.connectionState === 'failed' && offerer) pc.createOffer({ iceRestart: true }).then((o) => pc.setLocalDescription(o)).then(() => signal(pid, 'offer', pc.localDescription)).catch(() => {}); };
    if (offerer) { pc.addTransceiver(micTrack.current ?? 'audio', { direction: 'sendrecv' }); pc.addTransceiver(videoTrack() ?? 'video', { direction: 'sendrecv' }); }
    conns.current.set(pid, c);
    return c;
  };
  const flush = async (c: Conn) => { c.ready = true; for (const i of c.ice.splice(0)) await c.pc.addIceCandidate(i).catch(() => {}); };
  const call = async (pid: string) => { const c = makeConn(pid, true); const o = await c.pc.createOffer(); await c.pc.setLocalDescription(o); signal(pid, 'offer', c.pc.localDescription); };
  const onMessage = async (m: { from: string; type: string; data: any }) => {
    let c = conns.current.get(m.from);
    if (m.type === 'offer') {
      if (!c) c = makeConn(m.from, false);
      await c.pc.setRemoteDescription(m.data);
      for (const t of c.pc.getTransceivers()) { const kind = t.receiver.track.kind; t.direction = 'sendrecv'; await t.sender.replaceTrack(kind === 'audio' ? micTrack.current : videoTrack()).catch(() => {}); }
      const ans = await c.pc.createAnswer(); await c.pc.setLocalDescription(ans); signal(m.from, 'answer', c.pc.localDescription); await flush(c);
    } else if (m.type === 'answer' && c) { await c.pc.setRemoteDescription(m.data).catch(() => {}); await flush(c); }
    else if (m.type === 'ice' && c) { if (c.ready) await c.pc.addIceCandidate(m.data).catch(() => {}); else c.ice.push(m.data); }
    else if (m.type === 'bye' && c) { c.pc.close(); conns.current.delete(m.from); force((n) => n + 1); }
    else if (m.type === 'mute') { if (micTrack.current) micTrack.current.enabled = false; setMic(false); setNotice('The host muted you. Unmute when you want to speak.'); }
    else if (m.type === 'removed') { setNotice(null); end('The host removed you from the call.'); }
  };
  const end = (why?: string) => { if (me.current) post('leave', { pid: me.current.pid }).catch(() => {}); me.current = null; stopAll(); setPhase('ended'); setErr(why ?? null); if (!why) onClose(); };

  const join = async () => {
    setPhase('joining'); setErr(null);
    try {
      const r = await post('join', { mic: mic && !!micTrack.current, cam, kind: target.kind });
      me.current = { pid: r.pid, seq: r.seq, ice: r.iceServers };
      setHost(r.host); setPeers(r.peers); setStarted(Date.now()); setPhase('in');
      // Whoever joins later calls everyone already there.
      for (const p of r.peers as PeerInfo[]) if (p.seq < r.seq) await call(p.pid);
    } catch (e: any) { setErr(e.message); setPhase('lobby'); }
  };
  useEffect(() => {
    if (phase !== 'in') return;
    let busy = false;
    const t = setInterval(async () => {
      if (busy || !me.current) return; busy = true;
      try {
        const r = await post('poll', { pid: me.current.pid, state: state.current });
        setHost(r.host); setPeers(r.peers);
        for (const m of r.messages) await onMessage(m);
        for (const pid of [...conns.current.keys()]) if (!r.peers.some((p: PeerInfo) => p.pid === pid)) { conns.current.get(pid)!.pc.close(); conns.current.delete(pid); }
      } catch (e: any) { if (/not in this call/i.test(e.message)) end('You were disconnected from the call.'); }
      finally { busy = false; }
    }, 1000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(t); }, [notice]);

  const moderate = (action: string, targetPid?: string) => me.current && post('moderate', { pid: me.current.pid, action, target: targetPid }).then(() => setNotice(action === 'mute' ? (targetPid ? 'Asked them to mute' : 'Everyone else was muted') : action === 'remove' ? 'Removed from the call' : null)).catch((e: any) => setNotice(e.message));
  const sharer = peers.find((p) => p.screen);
  const tiles = useMemo(() => peers.map((p) => ({ p, c: conns.current.get(p.pid) })), [peers, conns.current.size, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const hands = peers.filter((p) => p.hand).length + (hand ? 1 : 0);

  if (phase === 'ended') return (
    <div className="call call-center" role="dialog" aria-modal="true" aria-label="Call ended">
      <div className="call-card"><ShieldAlert size={28} /><h2>{err ?? 'You left the call'}</h2><button className="btn primary" onClick={onClose}>Close</button></div>
    </div>
  );
  if (phase !== 'in') return (
    <div className="call call-center" role="dialog" aria-modal="true" aria-label={`Join ${target.title}`}>
      <div className="call-lobby">
        <div className="call-preview">
          <Tile name="You" stream={local.current} video={cam && !!camTrack.current} mic={mic} hand={false} me />
          <div className="call-preview-ctrl">
            <button type="button" className={`call-btn ${mic ? '' : 'off'}`} onClick={toggleMic} aria-pressed={!mic} aria-label={mic ? 'Turn microphone off' : 'Turn microphone on'}>{mic ? <Mic size={20} /> : <MicOff size={20} />}</button>
            <button type="button" className={`call-btn ${cam ? '' : 'off'}`} onClick={toggleCam} aria-pressed={!cam} aria-label={cam ? 'Turn camera off' : 'Turn camera on'}>{cam ? <Video size={20} /> : <VideoOff size={20} />}</button>
          </div>
        </div>
        <div className="call-lobby-t">
          <small>{target.kind === 'video' ? 'Video call' : 'Voice call'}</small>
          <h2>{target.title}</h2>
          <p>Check your camera and microphone, then join. Audio and video go directly between the people in the call.</p>
          {err && <div className="call-err" role="alert">{err}</div>}
          {notice && <div className="call-note">{notice}</div>}
          <div className="row"><button type="button" className="btn primary lg" onClick={join} disabled={phase === 'joining'}>{phase === 'joining' ? <Loader2 size={16} className="spin" /> : <Phone size={16} />} Join now</button><button type="button" className="btn lg" onClick={() => { stopAll(); onClose(); }}>Cancel</button></div>
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="call-ctrls" role="toolbar" aria-label="Call controls">
      <button type="button" className={`call-btn ${mic ? '' : 'off'}`} onClick={toggleMic} aria-pressed={!mic} title={mic ? 'Mute' : 'Unmute'} aria-label={mic ? 'Mute' : 'Unmute'}>{mic ? <Mic size={20} /> : <MicOff size={20} />}</button>
      <button type="button" className={`call-btn ${cam ? '' : 'off'}`} onClick={toggleCam} aria-pressed={!cam} title={cam ? 'Camera off' : 'Camera on'} aria-label={cam ? 'Turn camera off' : 'Turn camera on'}>{cam ? <Video size={20} /> : <VideoOff size={20} />}</button>
      {!mini && 'getDisplayMedia' in (navigator.mediaDevices ?? {}) && <button type="button" className={`call-btn ${screen ? 'on' : ''}`} onClick={toggleScreen} title={screen ? 'Stop sharing' : 'Share your screen'} aria-label={screen ? 'Stop sharing your screen' : 'Share your screen'}>{screen ? <MonitorOff size={20} /> : <MonitorUp size={20} />}</button>}
      {!mini && <button type="button" className={`call-btn ${hand ? 'on' : ''}`} onClick={() => setHand(!hand)} aria-pressed={hand} title={hand ? 'Lower hand' : 'Raise hand'} aria-label={hand ? 'Lower your hand' : 'Raise your hand'}><Hand size={20} /></button>}
      {!mini && <button type="button" className={`call-btn ${panel ? 'on' : ''}`} onClick={() => setPanel(!panel)} title="People" aria-label="People in the call"><Users size={20} />{hands > 0 && <i className="call-badge">{hands}</i>}</button>}
      <button type="button" className="call-btn leave" onClick={() => end()} title="Leave" aria-label="Leave the call"><PhoneOff size={20} /></button>
    </div>
  );

  if (mini) return (
    <div className="call-mini" role="region" aria-label="Call in progress">
      <div className="call-mini-head"><span className="call-live" /> <b>{target.title}</b><small>{peers.length + 1} · {mmss((now - started) / 1000)}</small><button type="button" className="call-icon" onClick={() => setMini(false)} aria-label="Expand the call"><Maximize2 size={15} /></button></div>
      <div className="call-mini-tiles">{tiles.slice(0, 2).map(({ p, c }) => <Tile key={p.pid} name={p.name} stream={c?.stream ?? null} video={p.cam || p.screen} mic={p.mic} hand={p.hand} staff={p.staff} screen={p.screen} />)}{!tiles.length && <div className="call-alone">Waiting for others…</div>}</div>
      {controls}
    </div>
  );

  const all = [{ me: true as const }, ...tiles.map((t) => ({ me: false as const, ...t }))];
  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={target.title}>
      <header className="call-head"><span className="call-live" /><b>{target.title}</b><small>{peers.length + 1} in the call · {mmss((now - started) / 1000)}</small><span className="spacer" />
        <button type="button" className="call-icon" onClick={() => setMini(true)} aria-label="Minimise the call" title="Minimise (keep chatting)"><Minimize2 size={17} /></button></header>
      {notice && <div className="call-toast" role="status">{notice}</div>}
      <div className="call-body">
        <div className={`call-grid n${Math.min(all.length, 9)} ${sharer || screen ? 'has-screen' : ''}`}>
          {all.map((t) => t.me
            ? <Tile key="me" name="You" stream={local.current} video={(cam && !!camTrack.current) || screen} mic={mic} hand={hand} me screen={screen} big={screen} />
            : <Tile key={t.p.pid} name={t.p.name} stream={t.c?.stream ?? null} video={t.p.cam || t.p.screen} mic={t.p.mic} hand={t.p.hand} staff={t.p.staff} screen={t.p.screen} big={t.p.screen} />)}
          {!peers.length && <div className="call-alone">You’re the first one here. Others in this channel can see the call and join.</div>}
        </div>
        {panel && <aside className="call-panel" aria-label="People">
          <div className="call-panel-head"><b>People ({peers.length + 1})</b><button type="button" className="call-icon" onClick={() => setPanel(false)} aria-label="Close"><X size={16} /></button></div>
          {host && peers.length > 0 && <button type="button" className="btn sm" onClick={() => moderate('mute')}><VolumeX size={14} /> Mute everyone</button>}
          <div className="call-person"><span className="call-av sm"><span>{initials('You')}</span></span><b>You{host ? ' (host)' : ''}</b>{hand && <Hand size={14} className="call-hand-i" />}{mic ? <Mic size={14} /> : <MicOff size={14} />}</div>
          {[...peers].sort((a, b) => Number(b.hand) - Number(a.hand)).map((p) => <div key={p.pid} className="call-person">
            <span className="call-av sm"><span className={p.staff ? 'staff' : ''}>{initials(p.name)}</span></span><b title={p.name}>{p.name}</b>
            {p.hand && <Hand size={14} className="call-hand-i" />}{p.mic ? <Mic size={14} /> : <MicOff size={14} />}
            {host && <><button type="button" className="call-icon" title="Ask to mute" aria-label={`Mute ${p.name}`} onClick={() => moderate('mute', p.pid)}><VolumeX size={14} /></button>
              <button type="button" className="call-icon" title="Remove from the call" aria-label={`Remove ${p.name}`} onClick={() => { if (confirm(`Remove ${p.name} from the call?`)) moderate('remove', p.pid); }}><UserMinus size={14} /></button></>}
          </div>)}
          {host && hands > 0 && <button type="button" className="ch-link" onClick={() => moderate('lower')}>Lower all hands</button>}
        </aside>}
      </div>
      {controls}
    </div>
  );
}

/** "Join call" / "Start a call" buttons and the banner for a channel with a call going on. */
export function CallButtons({ active, onStart, joined }: { active?: { count: number; names: string[]; kind: string } | null; onStart: (kind: 'audio' | 'video') => void; joined?: boolean }) {
  if (joined) return <span className="call-in"><span className="call-live" /> In the call</span>;
  return active ? (
    <button type="button" className="call-join" onClick={() => onStart(active.kind === 'audio' ? 'audio' : 'video')} title={active.names.join(', ')}><span className="call-live" /> Join call <b>{active.count}</b></button>
  ) : (
    <>
      <button type="button" className="ch-hbtn" onClick={() => onStart('audio')} aria-label="Start a voice call" title="Voice call"><Phone size={16} /></button>
      <button type="button" className="ch-hbtn" onClick={() => onStart('video')} aria-label="Start a video call" title="Video call"><Video size={16} /></button>
    </>
  );
}
