import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Captions, Clock, PlayCircle } from 'lucide-react';
import { PrepShell } from './common';
import data from '../data/lectures.json';

type Lecture = (typeof data.lectures)[number];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Video lectures: three demo lectures by three demo tutors, with captions, chapters and the transcript. */
export function VideosPage() {
  const [sp, setSp] = useSearchParams();
  const lec: Lecture = data.lectures.find((l) => l.id === sp.get('v')) ?? data.lectures[0];
  const [chapters, setChapters] = useState<Record<string, { duration: number; starts: number[] }>>({});
  const [now, setNow] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { fetch('/lectures/chapters.json').then((r) => r.json()).then(setChapters).catch(() => {}); }, []);
  useEffect(() => { setNow(0); }, [lec.id]);
  const ch = chapters[lec.id];
  const current = ch ? ch.starts.reduce((k, t, i) => (now >= t ? i : k), 0) : 0;
  const seek = (t: number) => { if (video.current) { video.current.currentTime = t; video.current.play().catch(() => {}); } };
  return (
    <PrepShell title="Video lectures" subtitle="Short lectures on procedure, writing and speaking. Captions, chapters and the full transcript are under each video.">
      <div className="pf-note" style={{ marginBottom: 18 }}><span>{data.note}</span></div>
      <div className="vl">
        <div className="vl-main">
          <div className="vl-player">
            <video key={lec.id} ref={video} controls preload="metadata" playsInline poster={`/lectures/${lec.id}.jpg`} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} style={{ ['--a' as any]: lec.tutor.accent }}>
              <source src={`/lectures/${lec.id}.mp4`} type="video/mp4" />
              <source src={`/lectures/${lec.id}.webm`} type="video/webm" />
              <track kind="captions" src={`/lectures/${lec.id}.vtt`} srcLang="en" label="English" default />
            </video>
          </div>
          <div className="vl-head">
            <span className="vl-av" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${lec.tutor.accent} 55%, #fff), ${lec.tutor.accent})` }}>{lec.tutor.initials}</span>
            <div><h2>{lec.title}</h2><p>{lec.tutor.name} · {lec.tutor.role}</p></div>
            <span className="pf-tag">{lec.level}</span>
          </div>
          <p className="vl-sum">{lec.summary}</p>
          <div className="vl-cols">
            <section className="pf-card pad">
              <h3>Chapters</h3>
              <ol className="vl-chapters">{lec.slides.map((s, i) => <li key={i}><button className={i === current ? 'on' : ''} onClick={() => ch && seek(ch.starts[i])}><span>{ch ? fmt(ch.starts[i]) : '—'}</span>{s.title}</button></li>)}</ol>
            </section>
            <section className="pf-card pad">
              <h3><Captions className="icon" /> Transcript</h3>
              <div className="vl-transcript">{lec.slides.map((s, i) => <p key={i} className={i === current ? 'on' : ''}><b>{s.title}</b> {s.say.join(' ')}</p>)}</div>
            </section>
          </div>
        </div>
        <aside className="vl-list" aria-label="All lectures">
          <div className="pf-eyebrow">3 lectures · 3 tutors</div>
          {data.lectures.map((l, i) => (
            <button key={l.id} className={`vl-item ${l.id === lec.id ? 'on' : ''}`} onClick={() => setSp({ v: l.id }, { replace: true })}>
              <span className="vl-thumb"><img src={`/lectures/${l.id}.jpg`} alt="" loading="lazy" /><PlayCircle className="icon" />{chapters[l.id] && <em>{fmt(chapters[l.id].duration)}</em>}</span>
              <span className="vl-meta"><small>Lecture {i + 1} · {l.level}</small><b>{l.title}</b><span><i style={{ background: l.tutor.accent }} />{l.tutor.name}</span></span>
            </button>
          ))}
          <p className="pf-small pf-muted"><Clock className="icon" style={{ width: 14, height: 14, verticalAlign: -2 }} /> Want live classes or one-to-one mentoring? See <a href="/services">Services</a>.</p>
        </aside>
      </div>
    </PrepShell>
  );
}
