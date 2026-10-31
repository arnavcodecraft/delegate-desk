import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Captions, Clock, PlayCircle } from 'lucide-react';
import { PrepShell } from './common';
import { api } from '../api';
import data from '../data/lectures.json';

export interface Lecture {
  id: string; title: string; level: string; summary: string;
  tutor: { name: string; role: string; initials: string; accent: string };
  video: string; videoAlt: string; poster: string; captions: string;
  chapters: { title: string; at: number }[]; transcript: string; duration: number | null; published?: boolean;
}
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Without a server (or before it answers): the three demo lectures bundled with the site.
const bundled: Lecture[] = data.lectures.map((l) => ({
  id: l.id, title: l.title, level: l.level, summary: l.summary, tutor: { name: l.tutor.name, role: l.tutor.role, initials: l.tutor.initials, accent: l.tutor.accent },
  video: `/lectures/${l.id}.mp4`, videoAlt: `/lectures/${l.id}.webm`, poster: `/lectures/${l.id}.jpg`, captions: `/lectures/${l.id}.vtt`,
  chapters: l.slides.map((s) => ({ title: s.title, at: 0 })), transcript: l.slides.map((s) => `${s.title}\n${s.say.join(' ')}`).join('\n\n'), duration: null,
}));

/** A YouTube or Vimeo link plays in their player; anything else is a video file. */
export function embedUrl(u: string): string | null {
  const yt = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vm = u.match(/^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}
const typeOf = (u: string) => (/\.webm($|\?)/i.test(u) ? 'video/webm' : /\.mp4($|\?)/i.test(u) ? 'video/mp4' : undefined);

/** One lecture's player: a video file with captions, or an embedded YouTube / Vimeo player. */
export function LecturePlayer({ lec, onTime, videoRef }: { lec: Lecture; onTime?: (t: number) => void; videoRef?: React.RefObject<HTMLVideoElement | null> }) {
  const embed = lec.video ? embedUrl(lec.video) : null;
  if (embed) return <iframe key={lec.id} src={embed} title={lec.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />;
  if (!lec.video) return <div className="vl-empty"><PlayCircle className="icon" />No video added yet</div>;
  return (
    <video key={lec.id + lec.video} ref={videoRef} controls preload="metadata" playsInline poster={lec.poster || undefined} onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)} style={{ ['--a' as any]: lec.tutor.accent }}>
      <source src={lec.video} type={typeOf(lec.video)} />
      {lec.videoAlt && <source src={lec.videoAlt} type={typeOf(lec.videoAlt)} />}
      {lec.captions && <track kind="captions" src={lec.captions} srcLang="en" label="English" default />}
    </video>
  );
}

/** Video lectures by the tutors, managed by the site owner (owner console → Videos). */
export function VideosPage() {
  const [sp, setSp] = useSearchParams();
  const [list, setList] = useState<Lecture[]>(bundled);
  const [now, setNow] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { api.get<{ lectures: Lecture[] }>('/api/lectures').then((r) => setList(r.lectures)).catch(() => { /* keep the bundled ones */ }); }, []);
  const lec = list.find((l) => l.id === sp.get('v')) ?? list[0];
  useEffect(() => { setNow(0); }, [lec?.id]);
  if (!lec) return <PrepShell title="Video lectures" subtitle="Short lectures on procedure, writing and speaking."><div className="pf-card pad"><p className="pf-muted" style={{ margin: 0 }}>New lectures are on the way. Check back soon.</p></div></PrepShell>;
  const timed = lec.chapters.some((c) => c.at > 0) && !embedUrl(lec.video);
  const current = timed ? lec.chapters.reduce((k, c, i) => (now >= c.at ? i : k), 0) : -1;
  const seek = (t: number) => { if (video.current) { video.current.currentTime = t; video.current.play().catch(() => {}); } };
  const paras = lec.transcript.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <PrepShell title="Video lectures" subtitle="Short lectures on procedure, writing and speaking. Captions, chapters and the full transcript are under each video.">
      <div className="vl">
        <div className="vl-main">
          <div className="vl-player"><LecturePlayer lec={lec} onTime={setNow} videoRef={video} /></div>
          <div className="vl-head">
            <span className="vl-av" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${lec.tutor.accent} 55%, #fff), ${lec.tutor.accent})` }}>{lec.tutor.initials}</span>
            <div><h2>{lec.title}</h2><p>{lec.tutor.name}{lec.tutor.role ? ` · ${lec.tutor.role}` : ''}</p></div>
            <span className="pf-tag">{lec.level}</span>
          </div>
          {lec.summary && <p className="vl-sum">{lec.summary}</p>}
          {(lec.chapters.length > 0 || paras.length > 0) && <div className="vl-cols">
            {lec.chapters.length > 0 && <section className="pf-card pad">
              <h3>Chapters</h3>
              <ol className="vl-chapters">{lec.chapters.map((c, i) => <li key={i}><button className={i === current ? 'on' : ''} onClick={() => timed && seek(c.at)}><span>{timed ? fmt(c.at) : '—'}</span>{c.title}</button></li>)}</ol>
            </section>}
            {paras.length > 0 && <section className="pf-card pad">
              <h3><Captions className="icon" /> Transcript</h3>
              <div className="vl-transcript">{paras.map((p, i) => { const [head, ...rest] = p.split('\n'); const ch = lec.chapters.findIndex((c) => c.title === head.trim()); return rest.length && ch >= 0 ? <p key={i} className={ch === current ? 'on' : ''}><b>{head}</b> {rest.join(' ')}</p> : <p key={i}>{p}</p>; })}</div>
            </section>}
          </div>}
        </div>
        <aside className="vl-list" aria-label="All lectures">
          <div className="pf-eyebrow">{list.length} lecture{list.length === 1 ? '' : 's'} · {new Set(list.map((l) => l.tutor.name)).size} tutor{new Set(list.map((l) => l.tutor.name)).size === 1 ? '' : 's'}</div>
          {list.map((l, i) => (
            <button key={l.id} className={`vl-item ${l.id === lec.id ? 'on' : ''}`} onClick={() => setSp({ v: l.id }, { replace: true })}>
              <span className="vl-thumb" style={{ ['--a' as any]: l.tutor.accent }}>{l.poster ? <img src={l.poster} alt="" loading="lazy" /> : <span className="vl-thumb-blank">{l.tutor.initials}</span>}<PlayCircle className="icon" />{l.duration ? <em>{fmt(l.duration)}</em> : null}</span>
              <span className="vl-meta"><small>Lecture {i + 1} · {l.level}</small><b>{l.title}</b><span><i style={{ background: l.tutor.accent }} />{l.tutor.name}</span></span>
            </button>
          ))}
          <p className="pf-small pf-muted"><Clock className="icon" style={{ width: 14, height: 14, verticalAlign: -2 }} /> Want live classes or one-to-one mentoring? See <a href="/services">Services</a>.</p>
        </aside>
      </div>
    </PrepShell>
  );
}
