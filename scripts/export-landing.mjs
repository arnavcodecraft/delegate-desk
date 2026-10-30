/**
 * Saves the home page as one self-contained HTML file (landing/index.html): styles, fonts and flags inlined,
 * no app code. Run the server first, then: node scripts/export-landing.mjs
 *   BASE_URL  where the server runs (default http://localhost:8080)
 *   SITE_URL  the public address links should point to, e.g. https://delegatedesk.example (default: keep them relative)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const SITE = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'landing', 'index.html');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hm-hero');
await page.evaluate(() => document.fonts.ready);

const html = await page.evaluate(async ({ SITE }) => {
  // Keep only the CSS this page uses.
  const matches = (sel) => {
    const parts = sel.split(',').map((x) => x.trim()).filter(Boolean);
    return parts.some((p) => {
      if (/^(:root|html|body|\*)/.test(p)) return true;
      // State classes (an open menu, the selected tab) must survive even if nothing is in that state right now.
      const clean = p.replace(/\.(open|on|sx-open)\b/g, '').replace(/::?(hover|focus|focus-within|focus-visible|active|visited|disabled|checked|placeholder|before|after|selection|-webkit-[a-z-]+|-moz-[a-z-]+|marker|first-child|last-child|only-child|nth-child\([^)]*\))/g, '').trim();
      try { return !!document.querySelector(clean || '*'); } catch { return false; }
    });
  };
  const walk = (rules) => {
    let out = '';
    for (const r of rules) {
      if (r instanceof CSSStyleRule) { if (matches(r.selectorText)) out += r.cssText + '\n'; }
      else if (r instanceof CSSMediaRule) { const inner = walk(r.cssRules); if (inner) out += `@media ${r.conditionText} {\n${inner}}\n`; }
      else if (r instanceof CSSSupportsRule) { const inner = walk(r.cssRules); if (inner) out += `@supports ${r.conditionText} {\n${inner}}\n`; }
      else if (r instanceof CSSFontFaceRule) { const range = r.style.getPropertyValue('unicode-range'); if (!range || /U\+0-FF|U\+0000-00FF/i.test(range)) out += r.cssText + '\n'; }
      else out += r.cssText + '\n';
    }
    return out;
  };
  let css = '';
  for (const sheet of document.styleSheets) { try { css += walk(sheet.cssRules); } catch { /* cross-origin */ } }
  // Inline fonts and flags as data URIs.
  const urls = [...new Set([...css.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))];
  for (const u of urls) {
    try {
      const b = await (await fetch(new URL(u, location.href))).blob();
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
      css = css.split(u).join(data);
    } catch { /* leave it */ }
  }
  const doc = document.documentElement.cloneNode(true);
  doc.querySelectorAll('script, link[rel="stylesheet"], link[rel="modulepreload"], link[rel="manifest"], style, [data-export="skip"], .sx-drawer, #toast-host').forEach((n) => n.remove());
  doc.querySelectorAll('[class*="toast"]').forEach((n) => { if (!n.closest('.pf')) n.remove(); });
  if (SITE) doc.querySelectorAll('a[href^="/"]').forEach((a) => a.setAttribute('href', SITE + a.getAttribute('href')));
  doc.querySelectorAll('a[href="/"], a[href^="/#"]').forEach((a) => { if (!SITE) a.setAttribute('href', a.getAttribute('href').slice(1) || '#'); });
  const style = document.createElement('style'); style.textContent = css;
  doc.querySelector('head').appendChild(style);
  return '<!doctype html>\n' + doc.outerHTML;
}, { SITE });

// A few lines of plain JavaScript bring back the menus, the phone menu, the audience tabs and the ticking timer.
const js = `<script>
(() => {
  document.querySelectorAll('.sx-menu').forEach((m) => { m.addEventListener('mouseenter', () => m.classList.add('open')); m.addEventListener('mouseleave', () => m.classList.remove('open')); });
  document.querySelectorAll('[data-aud]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-aud]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); document.getElementById('aud-' + x.dataset.aud).hidden = !on; });
  }));
  const burger = document.querySelector('.sx-burger');
  if (burger) burger.addEventListener('click', () => { document.querySelector('.sx-menus').classList.toggle('sx-open'); });
  const t = document.querySelector('.hm-app-timer'), bar = document.querySelector('.hm-app-bar i');
  let s = 54; setInterval(() => { s = s <= 1 ? 60 : s - 1; if (t) t.textContent = '0:' + String(s).padStart(2, '0'); if (bar) bar.style.width = (s / 60 * 100) + '%'; }, 1000);
})();
</script>
<style>@media (max-width: 980px) { .sx-menus.sx-open { display: flex; position: absolute; top: 66px; left: 0; right: 0; flex-direction: column; align-items: stretch; background: var(--pf-card); border-bottom: 1px solid var(--pf-line); padding: 10px 16px; } .sx-menus.sx-open .sx-drop { position: static; opacity: 1; visibility: visible; transform: none; padding-top: 0; } .sx-menus.sx-open .sx-drop-grid { width: auto; grid-template-columns: 1fr; box-shadow: none; } }</style>`;
const out = html.replace('</body>', js + '\n</body>');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`Saved ${OUT} (${(out.length / 1024).toFixed(0)} KB)`);
await browser.close();
