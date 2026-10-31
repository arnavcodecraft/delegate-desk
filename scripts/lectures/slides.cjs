// Draws the slides of the demo lectures (web/src/data/lectures.json) as 1280x720 PNGs, one folder per lecture.
// Usage: node scripts/lectures/slides.cjs <out-dir>
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(root, '.lectures'));
const data = JSON.parse(fs.readFileSync(path.join(root, 'web/src/data/lectures.json'), 'utf8'));
// Fonts are embedded: a page set from a string cannot read local files.
const font = (p) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'node_modules', p)).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const css = `
@font-face { font-family: Jakarta; src: url('${font('@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')}'); font-weight: 200 800; }
@font-face { font-family: Inter; src: url('${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1280px; height: 720px; font-family: Inter, sans-serif; color: #0b1630; overflow: hidden;
  background: radial-gradient(900px 500px at 85% -10%, color-mix(in srgb, var(--a) 18%, transparent), transparent 70%), linear-gradient(180deg, #ffffff, #f2f6fd); }
.top { position: absolute; left: 72px; right: 72px; top: 48px; display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; gap: 12px; align-items: center; font-family: Jakarta; font-weight: 800; font-size: 22px; }
.brand i { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg, #0b2a8a, #1f4fe0 55%, #4d84ff); color: #fff; font-style: normal; display: grid; place-items: center; font-size: 19px; }
.brand span { color: #8592aa; font-weight: 600; font-family: Inter; font-size: 17px; margin-left: 6px; }
.kicker { font-size: 17px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--a); background: color-mix(in srgb, var(--a) 12%, #fff); padding: 9px 18px; border-radius: 999px; }
.body { position: absolute; left: 72px; right: 72px; top: 150px; }
h1 { font-family: Jakarta; font-weight: 800; font-size: 58px; line-height: 1.06; letter-spacing: -.025em; max-width: 1000px; }
.title h1 { font-size: 72px; margin-top: 40px; }
.summary { margin-top: 26px; font-size: 26px; line-height: 1.45; color: #4a5874; max-width: 900px; }
ul { list-style: none; padding: 0; margin-top: 46px; display: grid; gap: 22px; }
li { display: flex; gap: 20px; align-items: flex-start; font-size: 31px; line-height: 1.3; font-weight: 500; }
li b { flex: none; width: 44px; height: 44px; border-radius: 13px; background: color-mix(in srgb, var(--a) 14%, #fff); color: var(--a); display: grid; place-items: center; font-size: 21px; font-weight: 800; margin-top: -2px; }
.foot { position: absolute; left: 72px; right: 72px; bottom: 44px; display: flex; align-items: center; gap: 16px; padding-top: 22px; border-top: 2px solid #e3e9f3; }
.av { width: 58px; height: 58px; border-radius: 50%; background: linear-gradient(135deg, color-mix(in srgb, var(--a) 55%, #fff), var(--a)); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 21px; }
.who b { display: block; font-size: 22px; } .who small { color: #8592aa; font-size: 17px; }
.right { margin-left: auto; text-align: right; color: #8592aa; font-size: 16px; line-height: 1.5; }
.right b { color: #0b1630; font-size: 18px; }
.title .av { width: 76px; height: 76px; font-size: 27px; }
.art { position: absolute; right: 60px; top: 150px; width: 400px; height: 400px; opacity: .9; }
.title .art { width: 440px; height: 440px; top: 130px; }
h1, .summary, ul { max-width: 740px; }
.title h1 { font-size: 64px; }
`;

const art = (a) => `<svg class="art" viewBox="0 0 400 400" fill="none" stroke="${a}" stroke-width="2.2"><circle cx="200" cy="200" r="150" fill="${a}" fill-opacity=".06"/><circle cx="200" cy="200" r="150"/><ellipse cx="200" cy="200" rx="60" ry="150"/><ellipse cx="200" cy="200" rx="110" ry="150"/><path d="M50 200h300M70 125h260M70 275h260"/><g stroke-opacity=".9"><path d="M104 330c40-26 66-26 96-10s56 16 96-10" stroke-width="3"/><path d="M110 352c36-20 60-20 90-6s54 14 90-6" stroke-width="3"/></g><circle cx="300" cy="96" r="7" fill="${a}"/><circle cx="140" cy="150" r="6" fill="${a}"/><circle cx="246" cy="236" r="6" fill="${a}"/><path d="M300 96Q220 90 140 150M140 150Q190 210 246 236" stroke-dasharray="6 6"/></svg>`;

function page(l, s, i) {
  const t = l.tutor; const first = i === 0;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="--a:${t.accent}" class="${first ? 'title' : ''}">
<div class="top"><div class="brand"><i>D</i>DelegateDesk<span>MUN lectures</span></div><div class="kicker">${esc(s.kicker)}</div></div>
${art(t.accent)}<div class="body"><h1>${esc(s.title)}</h1>${first ? `<p class="summary">${esc(l.summary)}</p>` : `<ul>${s.bullets.map((b, k) => `<li><b>${k + 1}</b><span>${esc(b)}</span></li>`).join('')}</ul>`}</div>
<div class="foot"><div class="av">${esc(t.initials)}</div><div class="who"><b>${esc(t.name)}</b><small>${esc(t.role)}</small></div>
<div class="right"><b>${i + 1} / ${l.slides.length}</b><br>Demo lecture · synthetic voice</div></div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  for (const l of data.lectures) {
    const dir = path.join(out, l.id); fs.mkdirSync(dir, { recursive: true });
    for (const [i, s] of l.slides.entries()) {
      await p.setContent(page(l, s, i), { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: path.join(dir, `slide-${String(i).padStart(2, '0')}.png`) });
    }
    console.log(`${l.id}: ${l.slides.length} slides`);
  }
  await browser.close();
})();
