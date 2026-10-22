import React from 'react';
import {
  Globe2, Shield, Scale, HeartHandshake, HeartPulse, Leaf, Coins, Users, BookOpen, Landmark, Newspaper, Zap, Stars, Home, Atom, Baby, Sprout, Fuel, type LucideIcon,
} from 'lucide-react';
import { EMBLEMS } from '../data/committees';

/* Flat illustrations for the wizard's choice cards, drawn in the platform palette. */
const W = 400, H = 275;
const Svg = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><rect width={W} height={H} fill={bg} />{children}</svg>
);

export function InPersonArt() {
  return (
    <Svg bg="#23211c">
      <defs>
        <radialGradient id="ip-spot" cx="50%" cy="10%" r="70%"><stop offset="0" stopColor="#f6e7b0" stopOpacity=".55" /><stop offset="1" stopColor="#f6e7b0" stopOpacity="0" /></radialGradient>
      </defs>
      {Array.from({ length: 7 }, (_, r) => Array.from({ length: 14 }, (_, c) => <circle key={`${r}-${c}`} cx={20 + c * 28 + (r % 2) * 14} cy={18 + r * 14} r={4.5} fill="#f1e3b6" opacity={0.08 + r * 0.03} />))}
      <rect width={W} height={H} fill="url(#ip-spot)" />
      <rect x="150" y="96" width="100" height="58" rx="6" fill="#17366f" /><rect x="164" y="104" width="72" height="8" rx="4" fill="#d6b25e" />
      <rect x="186" y="74" width="28" height="24" rx="3" fill="#3d3a33" /><rect x="198" y="58" width="4" height="18" fill="#8d8572" /><circle cx="200" cy="56" r="5" fill="#bdb39c" />
      {Array.from({ length: 4 }, (_, r) => Array.from({ length: 9 - (r % 2) }, (_, c) => (
        <g key={`p${r}-${c}`} transform={`translate(${30 + c * 42 + (r % 2) * 21} ${170 + r * 26})`}>
          <circle cx="12" cy="0" r={9 + r} fill={['#4b4639', '#3f3b31', '#5a5343', '#36332b'][(r + c) % 4]} />
          <rect x={-2 - r} y={8 + r} width={28 + r * 2} height={30} rx={10} fill={['#2c2a24', '#34312a', '#3a362d', '#2f2c25'][(r + c) % 4]} />
        </g>
      )))}
    </Svg>
  );
}
export function OnlineArt() {
  return (
    <Svg bg="#eef0ee">
      <rect x="0" y="210" width={W} height="65" fill="#d9d4c7" />
      <rect x="250" y="40" width="130" height="90" rx="6" fill="#20201d" /><rect x="256" y="46" width="118" height="78" rx="3" fill="#dfe7e1" />
      <rect x="306" y="130" width="18" height="34" fill="#9a9686" />
      <rect x="92" y="88" width="190" height="122" rx="10" fill="#c9cbc6" /><rect x="100" y="96" width="174" height="106" rx="5" fill="#1f2a25" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <g key={`${r}${c}`}><rect x={106 + c * 56} y={102 + r * 33} width="52" height="29" rx="4" fill={['#17366f', '#3b4d63', '#5b3d48', '#8a6d2a'][(r * 3 + c) % 4]} />
          <circle cx={132 + c * 56} cy={112 + r * 33} r="5" fill="#e9dcc0" /><rect x={124 + c * 56} y={118 + r * 33} width="16" height="9" rx="4" fill="#e9dcc0" /></g>
      )))}
      <path d="M70 210h234l14 10H56z" fill="#b8b9b3" />
      <rect x="44" y="176" width="34" height="34" rx="4" fill="#fff" /><path d="M78 186c10 0 10 14 0 14" stroke="#fff" strokeWidth="4" fill="none" />
      <rect x="330" y="182" width="40" height="28" rx="3" fill="#2a2a27" />
    </Svg>
  );
}
export function SchoolArt() {
  return (
    <Svg bg="#e9ece9">
      <rect x="0" y="215" width={W} height="60" fill="#cfd2cc" />
      <rect x="40" y="40" width="320" height="10" fill="#d5d8d2" />
      <rect x="150" y="62" width="100" height="62" rx="4" fill="#2f4a3a" /><rect x="156" y="68" width="88" height="50" rx="2" fill="#3c5f4a" />
      <path d="M165 82h40M165 92h60M165 102h30" stroke="#e7efe6" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      <rect x="186" y="130" width="28" height="22" fill="#8a6a46" /><rect x="190" y="152" width="20" height="30" fill="#6f5338" />
      {Array.from({ length: 3 }, (_, r) => Array.from({ length: 4 }, (_, c) => (
        <g key={`${r}${c}`} transform={`translate(${48 + c * 86 + (c > 1 ? 40 : 0)} ${150 + r * 26})`}>
          <rect width="56" height="8" rx="2" fill="#b08a5f" /><rect x="6" y="8" width="4" height="16" fill="#5f5f5a" /><rect x="46" y="8" width="4" height="16" fill="#5f5f5a" />
          <rect x="20" y="10" width="16" height="4" rx="1" fill="#6b6b66" />
        </g>
      )))}
      <rect x="320" y="70" width="44" height="54" rx="2" fill="#fff" stroke="#d1d1cb" /><path d="M326 82h32M326 92h24M326 102h28" stroke="#c9c9c2" strokeWidth="3" />
    </Svg>
  );
}
export function UniversityArt() {
  return (
    <Svg bg="#a8cbe6">
      <rect x="0" y="170" width={W} height="105" fill="#6aa156" /><rect x="0" y="230" width={W} height="45" fill="#5b8f49" />
      <circle cx="60" cy="150" r="34" fill="#4d7f3e" /><circle cx="350" cy="148" r="38" fill="#4d7f3e" />
      <rect x="90" y="86" width="220" height="92" fill="#b8593d" /><rect x="90" y="80" width="220" height="10" fill="#e6dfd2" />
      <polygon points="200,40 120,82 280,82" fill="#e6dfd2" /><rect x="192" y="18" width="16" height="26" fill="#e6dfd2" /><polygon points="200,8 190,20 210,20" fill="#c8c0b2" />
      {Array.from({ length: 2 }, (_, r) => Array.from({ length: 9 }, (_, c) => <rect key={`${r}${c}`} x={100 + c * 23} y={96 + r * 36} width="12" height="24" rx="1" fill="#e9eef2" opacity=".9" />))}
      {Array.from({ length: 6 }, (_, c) => <rect key={c} x={150 + c * 18} y="132" width="6" height="46" fill="#ece5d6" />)}
      <rect x="140" y="128" width="120" height="6" fill="#ece5d6" />
      <path d="M0 255 Q200 210 400 255 V275 H0z" fill="#d7c7a2" opacity=".55" />
    </Svg>
  );
}

/* Small illustrations for the size step. */
export function People({ n }: { n: 1 | 2 | 3 | 4 }) {
  const fig = (x: number, c: string, s = 1) => <g transform={`translate(${x} ${70 - 64 * s}) scale(${s})`}><circle cx="16" cy="14" r="12" fill={c} /><path d="M0 64 q0-32 16-32 q16 0 16 32z" fill={c} /></g>;
  if (n === 4) return (
    <svg viewBox="0 0 90 72" width="86" height="70" aria-hidden="true">
      <rect x="6" y="30" width="78" height="40" rx="4" fill="#5a4a7a" /><polygon points="45,6 4,32 86,32" fill="#7a6aa0" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={14 + i * 18} y="44" width="10" height="26" rx="5" fill="#2b2240" />)}
      <rect x="10" y="22" width="70" height="6" fill="#c9a227" /><circle cx="20" cy="18" r="3" fill="#e34" /><circle cx="70" cy="18" r="3" fill="#3a8" />
    </svg>
  );
  const cs = ['#3a2f45', '#4b3c58', '#5e4a6e', '#2c2433'];
  return (
    <svg viewBox="0 0 90 72" width="86" height="70" aria-hidden="true">
      {n === 1 && fig(29, cs[0])}
      {n === 2 && <>{fig(14, cs[1], 0.92)}{fig(44, cs[0], 0.92)}</>}
      {n === 3 && <>{fig(4, cs[2], 0.8)}{fig(54, cs[1], 0.8)}{fig(28, '#7b5fb0', 1)}</>}
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
