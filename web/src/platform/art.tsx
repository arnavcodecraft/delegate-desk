import React from 'react';
import {
  Globe2, Shield, Scale, HeartHandshake, HeartPulse, Leaf, Coins, Users, BookOpen, Landmark, Newspaper, Zap, Stars, Home, Atom, Baby, Sprout, Fuel, type LucideIcon,
} from 'lucide-react';
import { EMBLEMS } from '../data/committees';

/* Choice-card illustrations: blue duotone, geometric, on a soft grid. */
const W = 400, H = 225;
const B = { deep: '#0b2a8a', main: '#1f4fe0', mid: '#4d84ff', light: '#a9c4ff', pale: '#dbe6ff', paper: '#f4f7ff', white: '#ffffff' };
const Svg = ({ children, id }: { children: React.ReactNode; id: string }) => (
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
    <defs>
      <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke={B.pale} strokeWidth="1" /></pattern>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={B.main} /><stop offset="1" stopColor={B.mid} /></linearGradient>
    </defs>
    <rect width={W} height={H} fill={B.paper} /><rect width={W} height={H} fill={`url(#${id}-grid)`} />
    {children}
  </svg>
);
const Person = ({ x, y, s = 1, c = B.main }: { x: number; y: number; s?: number; c?: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}><circle cx="0" cy="-26" r="9" fill={c} /><path d="M-15 0 q0-16 15-16 q15 0 15 16z" fill={c} /></g>
);

export function InPersonArt() {
  return (
    <Svg id="ip">
      <circle cx="200" cy="112" r="92" fill={B.pale} />
      <rect x="138" y="70" width="124" height="70" rx="12" fill="url(#ip-g)" />
      <rect x="154" y="84" width="58" height="8" rx="4" fill={B.white} opacity=".9" /><rect x="154" y="100" width="92" height="6" rx="3" fill={B.white} opacity=".55" /><rect x="154" y="112" width="74" height="6" rx="3" fill={B.white} opacity=".55" />
      <rect x="194" y="140" width="12" height="22" fill={B.deep} />
      {[-120, -80, -40, 40, 80, 120].map((dx, i) => <Person key={i} x={200 + dx} y={196 - (Math.abs(dx) === 40 ? 6 : 0)} s={0.9} c={i % 2 ? B.mid : B.main} />)}
      <Person x={200} y={200} s={1} c={B.deep} />
    </Svg>
  );
}
export function OnlineArt() {
  return (
    <Svg id="on">
      <rect x="90" y="40" width="220" height="140" rx="14" fill={B.white} stroke={B.light} strokeWidth="2" />
      <rect x="90" y="40" width="220" height="24" rx="14" fill={B.pale} /><circle cx="108" cy="52" r="4" fill={B.light} /><circle cx="122" cy="52" r="4" fill={B.light} />
      {[0, 1].map((r) => [0, 1, 2].map((c) => (
        <g key={`${r}${c}`}><rect x={104 + c * 66} y={74 + r * 50} width="60" height="44" rx="8" fill={(r + c) % 2 ? B.pale : 'url(#on-g)'} />
          <Person x={134 + c * 66} y={112 + r * 50} s={0.7} c={(r + c) % 2 ? B.main : B.white} /></g>
      )))}
      <rect x="170" y="186" width="60" height="8" rx="4" fill={B.light} />
    </Svg>
  );
}
export function SchoolArt() {
  return (
    <Svg id="sc">
      <rect x="110" y="38" width="180" height="86" rx="10" fill={B.deep} />
      <path d="M130 62h70M130 78h100M130 94h56" stroke={B.light} strokeWidth="5" strokeLinecap="round" />
      <circle cx="252" cy="80" r="18" fill="none" stroke={B.mid} strokeWidth="5" />
      {[0, 1, 2].map((c) => <g key={c} transform={`translate(${96 + c * 76} 150)`}><rect width="56" height="10" rx="5" fill={B.main} /><rect x="8" y="10" width="5" height="22" fill={B.light} /><rect x="43" y="10" width="5" height="22" fill={B.light} /></g>)}
      {[0, 1, 2].map((c) => <Person key={c} x={124 + c * 76} y={150} s={0.75} c={c === 1 ? B.mid : B.main} />)}
    </Svg>
  );
}
export function UniversityArt() {
  return (
    <Svg id="un">
      <circle cx="320" cy="56" r="26" fill={B.pale} />
      <polygon points="200,28 104,74 296,74" fill="url(#un-g)" />
      <rect x="112" y="74" width="176" height="10" fill={B.deep} />
      {Array.from({ length: 6 }, (_, c) => <rect key={c} x={126 + c * 28} y="88" width="12" height="78" rx="3" fill={c % 2 ? B.mid : B.main} />)}
      <rect x="104" y="166" width="192" height="12" rx="3" fill={B.deep} /><rect x="92" y="178" width="216" height="10" rx="3" fill={B.light} />
      <circle cx="200" cy="54" r="7" fill={B.white} />
    </Svg>
  );
}

/* Small illustrations for the size step. */
export function People({ n }: { n: 1 | 2 | 3 | 4 }) {
  const fig = (x: number, c: string, s = 1) => <g transform={`translate(${x} ${70 - 64 * s}) scale(${s})`}><circle cx="16" cy="14" r="12" fill={c} /><path d="M0 64 q0-32 16-32 q16 0 16 32z" fill={c} /></g>;
  if (n === 4) return (
    <svg viewBox="0 0 90 72" width="86" height="70" aria-hidden="true">
      <polygon points="45,6 4,30 86,30" fill={B.main} /><rect x="8" y="30" width="74" height="6" fill={B.deep} />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={14 + i * 18} y="40" width="10" height="26" rx="3" fill={i % 2 ? B.mid : B.main} />)}
      <rect x="4" y="66" width="82" height="6" rx="2" fill={B.light} />
    </svg>
  );
  return (
    <svg viewBox="0 0 90 72" width="86" height="70" aria-hidden="true">
      {n === 1 && fig(29, B.main)}
      {n === 2 && <>{fig(14, B.mid, 0.92)}{fig(44, B.main, 0.92)}</>}
      {n === 3 && <>{fig(4, B.light, 0.8)}{fig(54, B.mid, 0.8)}{fig(28, B.main, 1)}</>}
    </svg>
  );
}

/* ---------- committee emblems ---------- */
const EMBLEM_ICONS: Record<string, LucideIcon> = {
  globe: Globe2, shield: Shield, scale: Scale, 'heart-handshake': HeartHandshake, 'heart-pulse': HeartPulse, leaf: Leaf, coins: Coins, users: Users, book: BookOpen,
  landmark: Landmark, newspaper: Newspaper, zap: Zap, stars: Stars, home: Home, atom: Atom, baby: Baby, sprout: Sprout, fuel: Fuel,
};
export function Emblem({ k, size, className }: { k?: string | null; size?: 'lg'; className?: string }) {
  const e = EMBLEMS.find((x) => x.key === k) ?? EMBLEMS[0];
  const Icon = EMBLEM_ICONS[e.key] ?? Globe2;
  return <span className={`pf-emblem ${size ?? ''} ${className ?? ''}`} style={{ background: `radial-gradient(circle at 30% 25%, ${e.color}cc, ${e.color} 55%, ${e.color}dd)` }}><Icon className="icon" /></span>;
}
export const emblemIcon = (k: string) => EMBLEM_ICONS[k] ?? Globe2;

/* ---------- flags ---------- */
export function Flag({ code, round, title }: { code?: string | null; round?: boolean; title?: string }) {
  if (!code) return <span className={`flag blank ${round ? 'round' : ''}`} title={title}>{(title ?? '?').slice(0, 1)}</span>;
  return <span className={`fi fi-${code} ${round ? 'fis flag round' : 'flag'}`} title={title} />;
}

/* ---------- banners ---------- */
export const BANNER_PRESETS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
export function bannerStyle(b: string | null | undefined): { className: string; style: React.CSSProperties } {
  if (!b || BANNER_PRESETS.includes(b)) return { className: `bn-${b || 'p1'}`, style: {} };
  return { className: '', style: { backgroundImage: `url(${b})` } };
}

/** Shrink an image file in the browser (logos 400px square, banners 1600px wide) to keep uploads small. */
export async function shrinkImage(file: File, kind: 'logo' | 'banner' | 'qr'): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Choose a PNG or JPG image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('That image could not be read')); i.src = url; });
    const max = kind === 'banner' ? 1600 : kind === 'qr' ? 900 : 400;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    if (kind === 'logo') {
      const side = Math.min(img.width, img.height); const out = Math.min(400, side);
      c.width = out; c.height = out;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
      return c.toDataURL('image/png');
    }
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return kind === 'qr' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.84);
  } finally { URL.revokeObjectURL(url); }
}
export function dataUrlToFile(d: string, name: string) {
  const [meta, b64] = d.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}
