// End-to-end test of the whole app: a new organiser creates a test conference and uses every feature,
// Run against a freshly seeded demo started with ALLOW_SANDBOX=1:  npm run e2e
// delegates/advisors/chairs use the public side, and every seeded role visits every screen it can open.
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const B = process.env.BASE_URL ?? 'http://localhost:8080';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(DIR, 'screenshots'); fs.rmSync(SHOTS, { recursive: true, force: true }); fs.mkdirSync(SHOTS);
const PROOF = path.join(DIR, '..', 'server', 'assets', 'demo-receipt.png');
const PDF = path.join(DIR, 'sample.pdf');
const results = []; const problems = [];
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec = (s) => { let b = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | B32.indexOf(c); b += 5; if (b >= 8) { o.push((v >>> (b - 8)) & 255); b -= 8; } } return Buffer.from(o); };
const totp = (s) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const m = crypto.createHmac('sha1', dec(s)).update(b).digest(); const o = m[m.length - 1] & 15; return String((m.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); };

const br = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const expected = [/\/api\/auth\/me/, /checkin\b.*400/, /\/api\/prep\/(research|draft|coach|practice|briefing|compare)/, /\/api\/prep\/projects\/[^/]+\/tasks/];
function watch(page, who) {
  page.on('pageerror', (e) => problems.push(`[${who}] JS error on ${page.url()}: ${e.message}`));
  page.on('response', (r) => { const s = r.status(); if (s >= 500 || (s >= 400 && s !== 401 && !expected.some((x) => x.test(r.url())))) problems.push(`[${who}] HTTP ${s} ${r.request().method()} ${r.url().replace(B, '')}`); });
  page.on('dialog', (d) => d.accept());
}
async function newPage(who, mobile = false) { const ctx = await br.newContext({ viewport: mobile ? { width: 400, height: 860 } : { width: 1360, height: 900 }, acceptDownloads: true }); if (who !== 'organiser') await ctx.addInitScript(() => { try { localStorage.setItem('dd-tour-off', '1'); } catch {} }); const p = await ctx.newPage(); watch(p, who); return p; }
let current = '';
async function step(name, page, fn) {
  current = name;
  const before = problems.length;
  try { await fn(); await page.waitForTimeout(250); const errorBox = await page.locator('.alert.bad, .error-box').count().catch(() => 0);
    if (problems.length > before) throw new Error(problems.slice(before).join(' | '));
    results.push(['PASS', name]); console.log('PASS', name);
  } catch (e) {
    results.push(['FAIL', name, String(e.message).split('\n')[0].slice(0, 400)]); console.log('FAIL', name, '—', String(e.message).split('\n')[0].slice(0, 400));
    await page.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`, fullPage: true }).catch(() => {});
  }
}
const api = (page, method, url, body) => page.evaluate(async ([m, u, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json', 'x-dd': '1' }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } if (!r.ok) throw new Error(`${m} ${u} → ${r.status} ${d?.error ?? t}`); return d; }, [method, url, body]);
const toast = async (page) => (await page.locator('.toast').last().innerText({ timeout: 4000 }).catch(() => '')).trim();
const cont = (p, t = 'Continue') => p.getByRole('button', { name: t, exact: true }).click();
const pfModal = (p) => p.locator('.pf-modal, .pf-editor').last();

// ============ ORGANISER: create the test conference ============
const org = await newPage('organiser');
let eventId = '', code = '', slug = '';
await step('wizard: create Test Model United Nations', org, async () => {
  await org.goto(`${B}/list`);
  await org.evaluate(() => localStorage.clear());
  await org.goto(`${B}/list`);
  await org.getByLabel('Full name').fill('Test Model United Nations');
  await org.getByLabel('Acronym').fill('TMUN');
  await org.getByLabel('First day').fill('2027-02-19'); await org.getByLabel('Last day').fill('2027-02-21');
  await cont(org);
  await org.getByRole('button', { name: /In Person/ }).click();
  await org.getByRole('button', { name: /Open to both/ }).click(); await cont(org);
  await org.getByLabel('Search countries').fill('India'); await org.getByRole('button', { name: 'India', exact: true }).click();
  await org.getByLabel('City').fill('New Delhi'); await cont(org);
  await org.getByRole('button', { name: /~100/ }).click(); await cont(org);
  for (const [type, name] of [['MUN', 'Security Council'], ['Custom', 'Lok Sabha'], ['Press', 'International Press Corps']]) {
    await org.getByRole('button', { name: /Add (your first|another) committee/ }).click();
    await org.getByRole('button', { name: new RegExp(`^${type}`) }).click();
    await pfModal(org).locator('input.pf-input').first().fill(name);
    await org.waitForTimeout(350);
    await org.getByRole('button', { name: 'Add committee' }).click();
  }
  await cont(org);
  await org.getByLabel('Description').fill('A test conference used to check every feature.'); await cont(org);
  await org.getByRole('button', { name: /Delegates pay a fee/ }).click(); await org.getByLabel(/Delegate fee/).fill('2000'); await cont(org);
  await org.getByLabel('Select all').check(); await cont(org, 'Continue to review');
  await org.getByLabel('Your name').fill('Tara Organiser'); await org.getByLabel('Organisation or society').fill('Test MUN Society');
  await org.getByLabel('Email', { exact: true }).fill('tara@testmun.example'); await org.getByLabel('Password (10+ characters)').fill('testmun-pass-1');
  await org.getByRole('button', { name: 'Create conference' }).click();
  await org.waitForSelector('text=is created', { timeout: 15000 });
  await org.screenshot({ path: `${SHOTS}/01-created.png` });
  await org.getByRole('link', { name: /Go to your dashboard/ }).click();
  await org.waitForURL(/overview/);
  const me = await api(org, 'GET', '/api/auth/me');
  eventId = me.events[0].id; code = me.events[0].code; slug = code.toLowerCase();
  if (!/^TMUN/.test(code)) throw new Error('unexpected code ' + code);
});
await step('dashboard tour runs on first visit and can be replayed', org, async () => {
  await org.goto(`${B}/app/overview`); await org.waitForSelector('.tour-card', { timeout: 8000 });
  for (let i = 0; i < 12 && await org.getByRole('button', { name: 'Next', exact: true }).count(); i++) { await org.getByRole('button', { name: 'Next', exact: true }).click(); await org.waitForTimeout(450); }
  await org.getByRole('button', { name: 'Done', exact: true }).click(); await org.waitForTimeout(300);
  if (await org.locator('.tour-card').count()) throw new Error('tour did not close');
  await org.reload(); await org.waitForTimeout(1500);
  if (await org.locator('.tour-card').count()) throw new Error('tour came back after finishing');
  await org.getByRole('button', { name: 'Take the tour' }).click(); await org.waitForSelector('.tour-card');
  await org.getByRole('button', { name: 'Skip' }).click();
});
await step('dashboard shows draft and priorities', org, async () => {
  await org.goto(`${B}/app/overview`); await org.waitForSelector('.db-next'); await org.waitForSelector('text=Next step');
  if (!(await org.locator('.badge', { hasText: 'Draft' }).count())) throw new Error('no Draft badge');
  await org.screenshot({ path: `${SHOTS}/02-overview.png`, fullPage: true });
});
await step('committees page lists the three committees with portfolios', org, async () => {
  await org.goto(`${B}/app/allocation`); await org.waitForSelector('text=Security Council');
  const inv = await api(org, 'GET', `/api/admin/events/${eventId}/inventory`);
  if (inv.length !== 3) throw new Error('committees ' + inv.length);
  if (inv.find((c) => c.short === 'UNSC').seats !== 15) throw new Error('UNSC seats ' + inv.find((c) => c.short === 'UNSC').seats);
  await org.getByRole('button', { name: 'Edit' }).first().click(); await org.waitForSelector('.pf-editor');
  await org.getByPlaceholder('What delegates will debate and what to prepare').fill('Maritime security and peacekeeping.');
  await org.getByRole('button', { name: 'Save committee' }).click(); await org.waitForTimeout(600);
  await org.screenshot({ path: `${SHOTS}/03-committees.png`, fullPage: true });
});
await step('conference page settings save', org, async () => {
  await org.goto(`${B}/app/conference`); await org.waitForSelector('text=Full name');
  await org.getByLabel('Venue').fill('India Habitat Centre');
  await org.getByRole('button', { name: 'Save', exact: true }).click(); await org.waitForTimeout(600);
  const p = await api(org, 'GET', `/api/admin/events/${eventId}/profile`);
  if (p.event.venue !== 'India Habitat Centre') throw new Error('venue not saved');
});
await step('financials wizard: fees + bank, QR, link, in person', org, async () => {
  await org.goto(`${B}/app/financials`); await org.getByRole('button', { name: /Set up payments|Change set-up/ }).click();
  await cont(org); // paid
  await org.getByLabel('Early-bird fee (₹)').fill('1600'); await org.getByLabel('Early bird ends on').fill('2026-12-31'); await cont(org);
  await cont(org); // GST off
  for (const m of ['Payment link', 'Payment QR code', 'Bank transfer', 'In-person payment']) await org.getByRole('button', { name: new RegExp(m) }).click();
  await cont(org);
  await org.getByLabel('Your payment page').fill('https://pay.example.com/tmun'); await cont(org);
  await org.getByLabel(/UPI ID/).fill('tmun@okaxis'); await cont(org);
  await org.getByLabel('Name on the account').fill('Test MUN Society'); await org.getByLabel('Account number or IBAN').fill('50100012345678'); await org.getByLabel(/IFSC, SWIFT/).fill('HDFC0001234'); await cont(org);
  await org.getByLabel('Instructions for payers').fill('Pay cash at the desk on Day 1.'); await cont(org);
  await org.getByRole('button', { name: 'Save', exact: true }).click(); await org.waitForTimeout(700);
  const f = await api(org, 'GET', `/api/admin/events/${eventId}/financials`);
  if (!f.methods.bank.enabled || !f.methods.qr.enabled || !f.methods.link.enabled || !f.methods.in_person.enabled) throw new Error('methods not saved');
  if (!f.tiers.some((t) => t.name === 'Early bird' && t.amount_paise === 160000)) throw new Error('early bird missing');
  await org.screenshot({ path: `${SHOTS}/04-financials.png`, fullPage: true });
});
await step('fee tiers tab: add coupon TEST10', org, async () => {
  await org.goto(`${B}/app/financials?tab=tiers`); await org.waitForSelector('text=Fee tiers');
  await org.getByRole('button', { name: '+ Coupon' }).click();
  await org.getByLabel('Code').fill('TEST10'); await org.getByLabel('Value (% or ₹)').fill('10');
  await org.getByRole('button', { name: 'Confirm' }).click(); await org.waitForTimeout(600);
  await org.waitForSelector('text=TEST10');
});
await step('payment rules tab: saves, no platform gateways for organisers', org, async () => {
  await org.goto(`${B}/app/financials?tab=rules`); await org.waitForSelector('text=Payment rules');
  if (await org.locator('text=Online payment gateways').count()) throw new Error('platform gateways shown to an organiser');
  await org.getByRole('button', { name: 'Save payment rules' }).click(); await org.waitForTimeout(500);
});
await step('applications settings: advisors, observers, chairs, position papers', org, async () => {
  await org.goto(`${B}/app/applications?tab=settings`); await org.waitForSelector('text=Who can apply');
  await org.getByText('Instantly, by preference').click();
  for (const l of ['Faculty advisors', 'Observers', /^Chairs/, /Collect position papers/]) { const sw = org.getByRole('switch', { name: l }).first(); if (!(await sw.isChecked())) await sw.click(); }
  await org.locator('input[type=date]').nth(1).fill('2027-02-10');
  await org.getByRole('button', { name: 'Save', exact: true }).click(); await org.waitForTimeout(600);
  const s = await api(org, 'GET', `/api/admin/events/${eventId}/applications-settings`);
  if (!s.roles.advisor || !s.roles.observer || !s.roles.chair || !s.positionPapers.enabled) throw new Error(JSON.stringify(s));
});
await step('publish', org, async () => {
  await org.goto(`${B}/app/overview`); await org.getByRole('button', { name: 'Publish' }).click(); await org.waitForTimeout(800);
  if (!(await org.locator('.badge', { hasText: 'Live' }).count())) throw new Error('not live');
});
await step('job board: post a director role for each committee', org, async () => {
  await org.goto(`${B}/app/jobs`); await org.getByRole('button', { name: /Post a director role/ }).click(); await org.waitForTimeout(900);
  if ((await org.locator('tbody tr').count()) < 3) throw new Error('roles not posted');
});
await step('public: Explore, conference page and Job Board show TMUN', org, async () => {
  await org.goto(`${B}/explore`); await org.waitForSelector(`text=${'TMUN'}`);
  await org.goto(`${B}/c/${slug}`); await org.waitForSelector('text=Apply as a delegate');
  await org.waitForSelector('text=Maritime security and peacekeeping.');
  await org.screenshot({ path: `${SHOTS}/05-public-page.png`, fullPage: true });
  await org.goto(`${B}/jobs`); await org.waitForSelector('text=Director, UNSC');
});

// ============ DELEGATES ============
async function registerDelegate(name, email, opts = {}) {
  const d = await newPage(`delegate ${name}`, true);
  await d.goto(`${B}/register/${code}?src=instagram`); await d.waitForSelector('text=Full name');
  await d.getByLabel(/Full name/).fill(name); await d.getByLabel('Email', { exact: true }).fill(email);
  await d.getByLabel(/Mobile/).first().fill(opts.mobile ?? '98' + String(Math.floor(10000000 + Math.random() * 89999999)));
  await d.getByLabel('School or college').fill('Delhi Public School'); await d.getByLabel('Class or year').selectOption({ index: 3 });
  await d.getByLabel('City').fill('New Delhi'); await d.getByLabel('Date of birth').fill('2005-06-06');
  await d.getByLabel('MUNs attended').fill(String(opts.muns ?? 3));
  await d.locator('button.chip').first().click();
  // Ask for the first portfolio that is open and that this experience qualifies for.
  const sel = d.getByLabel(/Preferred portfolio in/).first();
  const pick = await sel.locator('option:not([disabled]):not([value=""])').first();
  const portfolio = (await pick.count()) ? (await pick.innerText()).trim() : null;
  if (portfolio) await sel.selectOption({ label: portfolio });
  d.portfolio = portfolio;
  if (opts.coupon) { await d.getByText('Have a coupon code?').click(); await d.getByPlaceholder('e.g. EARLY10').fill(opts.coupon); }
  await d.getByLabel(/I agree/).check();
  await d.waitForTimeout(1700);
  await d.getByRole('button', { name: /Register|Send my application/ }).click();
  await d.waitForURL(/\/r\//, { timeout: 15000 }); await d.waitForTimeout(700);
  d.token = d.url().split('/r/')[1].split(/[?#/]/)[0];
  if (portfolio && !opts.review && !(await d.locator(`text=${portfolio}`).count())) throw new Error(`asked for ${portfolio} but did not get it`);
  return d;
}
let delA, delB, delC;
await step('delegate A registers (instant allotment) and sees bank, QR, link, in person', org, async () => {
  delA = await registerDelegate('Aisha Delegate', 'aisha@example.com');
  for (const t of ['Pay', 'Open the payment page', 'Paying in person?', '50100012345678']) await delA.waitForSelector(`text=${t}`);
  if (await delA.locator('text=Sandbox test payment').count()) throw new Error('sandbox offered to an organiser delegate');
  await delA.screenshot({ path: `${SHOTS}/06-delegate-pay.png`, fullPage: true });
});
await step('delegate A uploads payment proof', org, async () => {
  await delA.getByLabel('Transaction reference (UTR)').fill('432112345678');
  await delA.setInputFiles('#upload input[type=file]', PROOF);
  await delA.getByRole('button', { name: 'Submit payment proof' }).click(); await delA.waitForTimeout(900);
  await delA.reload(); await delA.waitForSelector('text=under review');
});
await step('organiser approves the proof → delegate A confirmed', org, async () => {
  await org.goto(`${B}/app/payments/review`); await org.waitForSelector('text=Aisha Delegate');
  await org.getByRole('button', { name: 'Approve' }).first().click(); await org.waitForTimeout(400);
  const confirm = org.getByRole('button', { name: /^(Approve|Confirm)/ }).last(); if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await org.waitForTimeout(900);
  await delA.reload(); await delA.waitForSelector('text=Confirmed');
});
await step('delegate A uploads a position paper', org, async () => {
  await delA.setInputFiles('text=Upload PDF >> input', PDF).catch(async () => { await delA.locator('input[type=file][accept="application/pdf"]').setInputFiles(PDF); });
  await delA.waitForTimeout(900); await delA.reload(); await delA.waitForSelector('text=Submitted');
});
await step('delegate B registers with coupon, pays in person, organiser records cash', org, async () => {
  delB = await registerDelegate('Bilal Delegate', 'bilal@example.com', { coupon: 'TEST10' });
  const ref = (await delB.locator('strong').filter({ hasText: /^TMUN/ }).first().innerText()).trim();
  const reg = (await api(org, 'GET', `/api/admin/events/${eventId}/applicants?status=all`)).find((r) => r.ref === ref);
  if (!reg) throw new Error('B not found');
  await org.goto(`${B}/app/financials`); await org.waitForSelector('text=Record an in-person payment');
  const portal = await api(delB, 'GET', `/api/public/r/${delB.url().split('/r/')[1].split('?')[0]}`);
  await org.getByLabel(/Delegate ID/).fill(ref); await org.getByLabel(/Amount received/).fill(String(portal.payment.duePaise / 100)); await org.getByLabel(/^Note/).fill('Receipt 001');
  await org.getByRole('button', { name: 'Record payment' }).click(); await org.waitForTimeout(900);
  await delB.reload(); await delB.waitForSelector('text=Confirmed');
});
await step('conference chat: All committees, a private message, and the team moderating', org, async () => {
  const tokA = delA.token, tokB = delB.token;
  try { await chatFlow(tokA, tokB); } catch (e) { await delA.screenshot({ path: `${SHOTS}/FAIL-chat-A.png` }); await delB.screenshot({ path: `${SHOTS}/FAIL-chat-B.png` }); await delA.goto(`${B}/r/${tokA}`); await delB.goto(`${B}/r/${tokB}`); throw e; }
});
async function chatFlow(tokA, tokB) {
  // On a phone the chat opens on the list of conversations; tap one to open it.
  await delA.goto(`${B}/r/${tokA}/chat`); await delA.waitForSelector('text=Conference chat');
  await delA.locator('.ch-item', { hasText: 'All committees' }).click();
  await delA.getByLabel('Message', { exact: true }).fill('Hello from Aisha'); await delA.getByRole('button', { name: 'Send' }).click();
  await delA.waitForSelector('.ch-bubble:has-text("Hello from Aisha")');
  await delB.goto(`${B}/r/${tokB}/chat`); await delB.locator('.ch-item', { hasText: 'All committees' }).click();
  await delB.waitForSelector('.ch-bubble:has-text("Hello from Aisha")', { timeout: 8000 });
  await delB.getByRole('button', { name: 'Chats' }).click();
  // A private message from B to A.
  await delB.getByRole('button', { name: 'New private message' }).click();
  await delB.locator('.ch-picker .ch-item').first().click();
  await delB.getByLabel('Message', { exact: true }).fill('Co-sponsor our paper?'); await delB.getByRole('button', { name: 'Send' }).click();
  await delB.waitForSelector('.ch-bubble:has-text("Co-sponsor our paper?")');
  await delA.reload(); await delA.waitForSelector('text=Private messages');
  await delA.locator('.ch-item', { hasText: '(Bilal)' }).first().click(); await delA.waitForSelector('.ch-bubble:has-text("Co-sponsor our paper?")');
  await delA.screenshot({ path: `${SHOTS}/10-chat.png` });
  // The team sees the group message, but not the private one.
  await org.goto(`${B}/app/chat`); await org.waitForSelector('.ch-bubble:has-text("Hello from Aisha")');
  if (await org.locator('.ch-bubble:has-text("Co-sponsor our paper?")').count()) throw new Error('team can read a private message');
  await delA.goto(`${B}/r/${tokA}`); await delB.goto(`${B}/r/${tokB}`);
}
await step('review mode: delegate C applies, organiser scores and assigns', org, async () => {
  await org.goto(`${B}/app/applications?tab=settings`); await org.getByText('After we review applications').click();
  await org.getByRole('button', { name: 'Save', exact: true }).click(); await org.waitForTimeout(600);
  delC = await registerDelegate('Chen Delegate', 'chen@example.com', { review: true });
  await delC.waitForSelector('text=Application under review');
  await org.goto(`${B}/app/applications`); await org.waitForSelector('text=Chen Delegate');
  await org.getByLabel('Score').first().selectOption('7'); await org.waitForTimeout(400);
  await org.getByRole('button', { name: 'Accept & assign' }).first().click(); await org.waitForTimeout(600);
  await org.locator('input[name=seat]').first().check(); await org.getByRole('button', { name: 'Assign', exact: true }).click(); await org.waitForTimeout(900);
  await delC.reload(); await delC.waitForSelector('text=Provisional');
});
await step('faculty advisor applies; organiser accepts', org, async () => {
  const a = await newPage('advisor');
  await a.goto(`${B}/c/${slug}`); await a.getByRole('button', { name: 'Apply as a faculty advisor' }).click();
  await a.getByLabel('Full name').fill('Mrs Advisor'); await a.getByLabel('Email').fill('advisor@school.example'); await a.getByLabel(/School or institution/).fill('Delhi Public School');
  await a.getByRole('button', { name: 'Send application' }).click(); await a.waitForSelector('text=Application sent');
  await org.goto(`${B}/app/applications?tab=advisor`); await org.getByText('Mrs Advisor').click();
  await org.getByRole('button', { name: 'Accept', exact: true }).click(); await org.waitForTimeout(800);
  await a.getByRole('link', { name: 'Check its status' }).click(); await a.waitForSelector('text=Accepted');
});
let chairInvite = '';
await step('chair applies from the Job Board with a CV; organiser accepts with an account', org, async () => {
  const c = await newPage('chair applicant');
  await c.goto(`${B}/jobs`); await c.locator('.pf-job', { hasText: 'Director, UNSC' }).getByRole('button', { name: 'Apply' }).click();
  await c.getByLabel('Full name').fill('Charu Chair'); await c.getByLabel('Email').fill('charu@chairs.example'); await c.getByLabel(/School, college or organisation/).fill('St Stephen’s College');
  await c.getByLabel(/Your MUN experience/).fill('Chaired five Security Councils and two crisis committees.');
  await c.setInputFiles('input[type=file]', PDF);
  await c.getByRole('button', { name: 'Send application' }).click(); await c.waitForSelector('text=Application sent');
  await org.goto(`${B}/app/applications?tab=team`); await org.getByText('Charu Chair').click();
  await org.getByRole('button', { name: 'Accept', exact: true }).click(); await org.waitForTimeout(1000);
  const mail = (await api(org, 'GET', '/api/admin/notifications?q=charu')).find((n) => n.template_key === 'staff_invite');
  chairInvite = /(https?:\/\/\S+\/invite\/\S+)/.exec(mail?.body ?? '')?.[1] ?? '';
  if (!chairInvite) throw new Error('no staff invite email with a link');
});
await step('chair signs in, reviews the position paper and runs a live session', org, async () => {
  const ch = await newPage('chair');
  await ch.goto(chairInvite.replace(/^https?:\/\/[^/]+/, B)); await ch.waitForSelector('text=For charu@chairs.example');
  await ch.getByLabel('Password', { exact: true }).fill('charu-chair-pass'); await ch.getByLabel('Type it again').fill('charu-chair-pass');
  await ch.getByRole('button', { name: /Set password and open the dashboard/ }).click();
  await ch.waitForURL(/\/app/); await ch.goto(`${B}/app/documents`); await ch.waitForSelector('text=Position papers');
  await ch.getByText('Aisha Delegate').click(); await ch.getByLabel('Score (0–10)').selectOption('8'); await ch.getByLabel('Feedback').fill('Clear and well researched.');
  await ch.getByRole('button', { name: 'Send feedback' }).click(); await ch.waitForTimeout(700);
  await ch.goto(`${B}/app/sessions`); await ch.waitForSelector('text=Start live session');
  const [con] = await Promise.all([ch.context().waitForEvent('page'), ch.getByRole('button', { name: 'Start live session' }).first().click()]);
  watch(con, 'chair room'); await con.waitForSelector('[data-testid=chair-room]');
  await con.getByRole('tab', { name: 'Roll call' }).click(); await con.getByRole('button', { name: 'All present' }).click(); await con.waitForTimeout(400);
  await con.getByRole('button', { name: 'Finish roll call' }).click();
  await con.getByRole('tab', { name: 'Motions' }).click(); await con.getByRole('button', { name: 'Raise a motion' }).first().click();
  await con.getByPlaceholder('e.g. Humanitarian response in conflict zones').fill('Maritime security'); await con.locator('.rm-raise-foot button').click(); await con.waitForTimeout(400);
  await con.locator('.rm-motion').getByRole('button', { name: 'Vote' }).first().click(); await con.waitForSelector('.rm-ballots');
  for (const y of await con.locator('.rm-ballot button[title="For"]').all()) await y.click();
  await con.getByRole('button', { name: 'Close the vote' }).click(); await con.waitForSelector('text=Passes');
  await con.screenshot({ path: `${SHOTS}/07-chair-console.png` });
  // EB marking: a caucus segment, a recognised speech with a mark and verbatim, a POI, a chit, lobbying, the export and awards.
  await con.getByRole('button', { name: 'Clear result' }).click();
  await con.getByRole('button', { name: 'Scores' }).click(); await con.getByRole('button', { name: /EB marking/ }).click(); await con.getByRole('button', { name: 'Start marking' }).click(); await con.waitForSelector('text=Segments');
  await con.getByPlaceholder('Topic (optional)').fill('Maritime security'); await con.getByRole('button', { name: 'Add', exact: true }).click(); await con.waitForSelector('text=MOD-1');
  const rec = con.getByLabel('Recognise a delegation').last(); await rec.selectOption({ index: 1 }); await con.getByRole('button', { name: 'Recognise' }).last().click();
  await con.waitForSelector('.mk-speech'); const score = con.locator('.mk-speech .mk-score').first(); await score.fill('4.5'); await score.press('Enter');
  await con.locator('.mk-speech textarea').first().fill('Cited UNCLOS article 87 and called for joint patrols.'); await con.waitForTimeout(1200);
  await con.getByLabel('Asked by').last().selectOption({ index: 2 }); await con.getByRole('button', { name: 'Add POI' }).click(); await con.waitForTimeout(400);
  await con.locator('.mk-line .mk-score').first().fill('0.5'); await con.locator('.mk-line .mk-score').first().press('Enter'); await con.waitForTimeout(400);
  await con.getByLabel('From').selectOption({ index: 1 }); await con.getByLabel('Chit mark').fill('8'); await con.getByRole('button', { name: 'Add chit' }).click(); await con.waitForTimeout(500);
  await con.getByRole('tab', { name: 'Marksheet' }).click(); await con.waitForSelector('.mk-table');
  const lob = con.locator('.mk-table input[aria-label^="Lobbying"]').first(); await lob.fill('3'); await lob.press('Enter'); await con.waitForTimeout(600);
  const top = await con.locator('.mk-table tbody tr').first().locator('td.tot').innerText();
  if (!(Number(top) > 0)) throw new Error('marksheet total not computed: ' + top);
  const [dl] = await Promise.all([con.waitForEvent('download'), con.getByRole('button', { name: 'Export Excel' }).click()]);
  if (!/marksheet\.xlsx$/.test(dl.suggestedFilename())) throw new Error('bad export name ' + dl.suggestedFilename());
  await con.getByRole('tab', { name: 'Verbatim' }).click(); await con.waitForSelector('text=Cited UNCLOS article 87');
  await con.getByRole('tab', { name: 'Recognition' }).click(); await con.waitForSelector('text=Least recognised first');
  await con.getByRole('tab', { name: 'Scheme' }).click(); await con.getByRole('button', { name: 'Save scheme' }).click(); await con.waitForTimeout(400);
  await con.getByRole('button', { name: 'Send awards to certificates' }).click(); await con.waitForTimeout(1200);
  await con.screenshot({ path: `${SHOTS}/08-eb-marking.png`, fullPage: true });
  const pub = await (await fetch(`${B}/api/live/${con.url().split('/session/')[1].split('/')[0]}`)).json();
  if (pub.marking !== undefined || pub.marksheet !== undefined) throw new Error('marks leaked to the public view');
  await delA.reload(); await delA.waitForSelector('text=8/10');
});
await step('documents: upload a study guide PDF', org, async () => {
  await org.goto(`${B}/app/documents`); await org.waitForSelector('text=Study guides');
  const [chooser] = await Promise.all([org.waitForEvent('filechooser'), org.getByRole('button', { name: 'Upload PDF' }).first().click()]);
  await chooser.setFiles(PDF); await org.waitForTimeout(900);
  await org.waitForSelector('text=Open');
});
await step('check-in delegate A at the door', org, async () => {
  const ref = (await api(org, 'GET', `/api/admin/events/${eventId}/applicants?status=all`)).find((r) => r.full_name === 'Aisha Delegate').ref;
  await org.goto(`${B}/app/checkin`); await org.getByLabel('Badge code or delegate ID').fill(ref); await org.getByRole('button', { name: 'Check in' }).click();
  await org.waitForSelector('text=1 of');
});
await step('lists, exports, badges and certificates', org, async () => {
  await org.goto(`${B}/app/lists`); await org.waitForTimeout(800);
  for (const u of [`/api/admin/events/${eventId}/badges.pdf`, `/api/admin/events/${eventId}/certificates.pdf`, `/api/admin/events/${eventId}/lists/master/export?format=csv`, `/api/admin/events/${eventId}/lists/master/export?format=xlsx`]) {
    const r = await org.request.get(B + u); if (r.status() !== 200) throw new Error(`${u} → ${r.status()}`);
  }
});
await step('communications: templates and a bulk email', org, async () => {
  await org.goto(`${B}/app/messages`); await org.waitForSelector('text=Communications');
  const r = await api(org, 'POST', `/api/admin/events/${eventId}/bulk-message`, { template: 'event_reminder', list: 'master' });
  if (!(r.queued >= 2)) throw new Error('bulk queued ' + r.queued);
});
await step('refund delegate B, approve and record the bank reference', org, async () => {
  const reg = (await api(org, 'GET', `/api/admin/events/${eventId}/applicants?status=all`)).find((r) => r.full_name === 'Bilal Delegate');
  await org.goto(`${B}/app/registrations/${reg.id}`); await org.getByRole('button', { name: 'Refund…' }).click();
  await org.getByLabel('Reason').fill('Cannot attend'); await org.getByRole('button', { name: 'Confirm' }).click(); await org.waitForTimeout(700);
  await org.goto(`${B}/app/payments`); await org.waitForTimeout(700);
  await org.getByText('Refunds', { exact: true }).click().catch(() => {});
  await org.waitForTimeout(500);
  const rf = (await api(org, 'GET', `/api/finance/refunds`).catch(() => null)) ?? [];
  const id = rf.find?.((x) => x.status === 'requested')?.id;
  if (!id) throw new Error('refund not listed');
  await api(org, 'POST', `/api/finance/refunds/${id}/approve`);
  await api(org, 'POST', `/api/finance/refunds/${id}/complete`, { reference: 'NEFT123456' });
});
await step('expenses: create, approve, pay', org, async () => {
  const e = await api(org, 'POST', '/api/finance/expenses', { event_id: eventId, category: 'venue', description: 'Hall booking', bill_date: '2026-10-20', amount_paise: 5000000, status: 'submitted' });
  await org.goto(`${B}/app/expenses`); await org.waitForSelector('text=Hall booking');
  await api(org, 'POST', `/api/finance/expenses/${e.id}/approve`);
  await api(org, 'POST', `/api/finance/expenses/${e.id}/pay`, { amount_paise: 5000000, mode: 'bank', reference: 'UTR998877', paid_on: '2026-10-21' });
});
await step('books: trial balance balances', org, async () => {
  const tb = await api(org, 'GET', '/api/finance/books/trial-balance');
  const rows = tb.rows ?? tb; const dr = rows.reduce((s, r) => s + (r.debit_paise ?? r.debit ?? 0), 0); const cr = rows.reduce((s, r) => s + (r.credit_paise ?? r.credit ?? 0), 0);
  if (tb.totals && tb.totals.debit !== tb.totals.credit) throw new Error('trial balance does not balance');
  if (!tb.totals && dr !== cr) throw new Error(`trial balance ${dr} vs ${cr}`);
  await org.goto(`${B}/app/books`); await org.waitForSelector('text=Trial balance');
});
await step('settings: every tab loads; invite a team member; back up now', org, async () => {
  await org.goto(`${B}/app/settings`);
  for (const t of ['Event rules', 'Organisation', 'Users & roles', 'Integrations', 'Google Sheets', 'Backups', 'Data protection']) { await org.getByRole('tab', { name: t }).click(); await org.waitForTimeout(500); }
  await org.getByRole('tab', { name: 'Event rules' }).click(); await org.getByRole('button', { name: 'Save event settings' }).click(); await org.waitForTimeout(500);
  await org.getByRole('tab', { name: 'Users & roles' }).click(); await org.getByRole('button', { name: /Invite staff/ }).click();
  await org.getByLabel('Name').fill('Dev Desk'); await org.getByLabel('Email').fill('dev@testmun.example'); await org.getByRole('button', { name: 'Confirm' }).click(); await org.getByRole('button', { name: 'Done' }).click(); await org.waitForSelector('text=Dev Desk');
  await org.waitForSelector('text=Invited');
  const inviteMail = (await api(org, 'GET', '/api/admin/notifications?q=dev@testmun')).find((n) => n.template_key === 'staff_invite');
  const link = /(https?:\/\/\S+\/invite\/\S+)/.exec(inviteMail?.body ?? '')?.[1];
  if (!link) throw new Error('no invite link emailed');
  const dev = await newPage('invited staff');
  await dev.goto(link.replace(/^https?:\/\/[^/]+/, B)); await dev.getByLabel('Password', { exact: true }).fill('dev-desk-pass-1'); await dev.getByLabel('Type it again').fill('dev-desk-pass-1');
  await dev.getByRole('button', { name: /Set password/ }).click(); await dev.waitForURL(/\/app/);
  await dev.context().close();
  await org.getByRole('tab', { name: 'Backups' }).click(); await org.getByRole('button', { name: 'Back up now' }).click(); await org.waitForSelector('text=Passed', { timeout: 15000 });
});
await step('every organiser screen opens without errors', org, async () => {
  const links = await org.locator('.side a.nav').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const l of links) { await org.goto(B + l); await org.waitForTimeout(700); const bad = await org.locator('.error-box').count(); if (bad) throw new Error(`error box on ${l}: ` + await org.locator('.error-box').first().innerText()); }
});
await step('organiser cannot see the demo organiser\'s conference', org, async () => {
  const me = await api(org, 'GET', '/api/auth/me'); if (me.events.some((e) => e.code === 'BGYS27')) throw new Error('isolation broken');
});

await step('one account, both roles: the organiser opens their delegate profile and comes back', org, async () => {
  await org.goto(B + '/app/overview'); await org.getByTestId('delegate-profile').click();
  await org.waitForSelector('text=/Hello, /'); await org.waitForSelector('main >> text=MUN CV');
  await org.locator('.pf-pagehead').getByRole('link', { name: 'Organiser dashboard' }).click(); await org.waitForURL(/\/app/);
});

// ============ delegate account and Prep ============
await step('delegate account: sign up, confirm the email, see the conference', org, async () => {
  const s = await newPage('student');
  await s.goto(`${B}/account?mode=signup`); await s.getByLabel('Your name').fill('Aisha Delegate'); await s.getByLabel('Email').fill('aisha@example.com');
  await s.getByLabel('Password').fill('aisha-pass-123'); await s.getByRole('button', { name: 'Create account' }).click();
  await s.waitForSelector('text=Confirm your email');
  const code = (await s.locator('text=/here is your code/').innerText()).match(/\d{6}/)[0];
  await s.getByLabel('Verification code').fill(code); await s.getByRole('button', { name: 'Confirm' }).click();
  await s.waitForSelector('text=Test Model United Nations');
  await s.screenshot({ path: `${SHOTS}/09-account.png`, fullPage: true });
  globalThis.student = s;
  // The same /login page signs delegates in (and organiser teams): no separate delegate sign-in.
  const again = await newPage('student, second device');
  await again.goto(`${B}/login`); await again.getByLabel('Email').fill('aisha@example.com'); await again.getByLabel('Password').fill('aisha-pass-123');
  await again.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await again.waitForURL(/\/account/); await again.waitForSelector('text=Test Model United Nations');
});
await step('delegate account: save a conference, build a MUN CV with links', org, async () => {
  const s = globalThis.student;
  await s.goto(`${B}/c/${slug}`); await s.getByRole('button', { name: 'Save', exact: true }).click(); await s.waitForSelector('button:has-text("Saved")');
  await s.goto(`${B}/account`); await s.waitForSelector('text=Saved conferences'); await s.waitForSelector(`.pf-saved-row`);
  await s.getByLabel('Instagram').fill('@aisha.mun'); await s.getByRole('button', { name: 'Save links' }).click(); await s.waitForSelector('text=Links saved');
  await s.goto(`${B}/account/cv`); await s.waitForSelector('main >> text=MUN CV');
  await s.getByRole('button', { name: 'Add an entry' }).first().click();
  await s.getByLabel('Title').fill('Springdales MUN 2026'); await s.getByLabel('Role').fill('France, UNSC · Best Delegate');
  await s.getByRole('button', { name: 'Save', exact: true }).click();
  await s.waitForSelector('.cv-item:has-text("Springdales MUN 2026")'); await s.waitForSelector('.cv-socials:has-text("instagram.com/aisha.mun")');
  await s.screenshot({ path: `${SHOTS}/11-cv.png`, fullPage: true });
});
await step('prep: tools work without AI or an account', org, async () => {
  const s = await newPage('tools visitor');
  await s.goto(`${B}/prep/tools`); await s.waitForSelector('text=Resolution formatter');
  await s.goto(`${B}/prep/tools/formatter`); await s.waitForSelector('text=Decides to remain seized of the matter.');
  await s.goto(`${B}/prep/tools/voting`); await s.getByLabel('Yes').fill('10'); await s.getByLabel('No').fill('4'); await s.waitForSelector('text=Passes');
  await s.getByRole('button', { name: 'Security Council (substantive)' }).click(); await s.getByLabel('P5 voting no').fill('1'); await s.waitForSelector('text=Fails');
  await s.goto(`${B}/prep/tools/decoder`); await s.waitForSelector('text=Security Council');
  for (const t of ['timer', 'speakers', 'quorum', 'motions', 'acronyms', 'placards', 'allocation', 'packing']) { await s.goto(`${B}/prep/tools/${t}`); await s.waitForTimeout(400); if (await s.locator('text=Tool not found').count()) throw new Error(t); }
  await s.goto(`${B}/prep/countries`); await s.getByLabel('Search countries').fill('India'); await s.waitForSelector('text=New Delhi');
  await s.goto(`${B}/prep/coach`); await s.locator('.pp-editor').fill('Background: the topic. '.repeat(30)); await s.waitForSelector('text=Country policy');
  await s.context().close();
});
await step('prep: research project, team invite, learning streak (AI off reports clearly)', org, async () => {
  const s = globalThis.student;
  await s.goto(`${B}/prep/research`); await s.getByLabel('Delegation').fill('Pakistan'); await s.getByLabel('Committee').fill('UNSC'); await s.getByLabel('Topic').fill('Maritime security');
  await s.getByRole('button', { name: 'Create project' }).click(); await s.waitForURL(/\/prep\/projects\//);
  await s.getByRole('button', { name: /Run \d+ tasks?/ }).click(); await s.waitForSelector('text=/not switched on|Researching|Still researching|Research task/', { timeout: 20000 });
  await s.getByPlaceholder('Teammate or advisor email').fill('advisor@example.com'); await s.getByRole('button', { name: 'Invite' }).click(); await s.waitForSelector('text=advisor@example.com');
  await s.getByPlaceholder('Paste a quote, a link or your own notes').fill('Our red line: no new sanctions.'); await s.getByRole('button', { name: 'Add', exact: true }).click(); await s.waitForSelector('text=Our red line');
  await s.goto(`${B}/prep/learn/un-1`); for (const q of await s.locator('.pp-q').all()) await q.locator('.pp-opts button').first().click();
  await s.waitForSelector('text=Saved to your progress'); await s.goto(`${B}/prep/learn`); await s.waitForSelector('text=1 day streak');
  for (const pg of ['/prep', '/prep/write', '/prep/practice', '/prep/discover']) { await s.goto(B + pg); await s.waitForTimeout(500); }
  await s.context().close();
});

// ============ standalone live session ============
await step('anyone can run a session at /session; a delegate joins and asks to speak', org, async () => {
  const p = await newPage('session chair');
  await p.goto(`${B}/session`); await p.getByRole('button', { name: 'New session' }).click();
  await p.locator('.pf-editor input.pf-input').first().fill('General Assembly');
  await p.getByRole('button', { name: /^P5/ }).click(); await p.getByRole('button', { name: 'Add committee' }).click();
  await p.waitForURL(/\/chair/); await p.waitForSelector('.rm-code'); const sc = (await p.locator('.rm-code').innerText()).match(/\b[A-Z2-9]{6}\b/)[0];
  await p.getByRole('tab', { name: 'Roll call' }).click(); await p.getByRole('button', { name: 'All present' }).click(); await p.getByRole('button', { name: 'Finish roll call' }).click();
  const d = await newPage('session delegate', true); await d.goto(`${B}/session/${sc}`); await d.getByRole('button', { name: /France/ }).click();
  await d.getByRole('button', { name: 'Ask to speak' }).click(); await p.waitForSelector('text=Asking to speak', { timeout: 6000 });
  // The chair takes the request, starts the speech and sees the timer run.
  await p.locator('.rm-requests button[aria-label="Accept"]').first().click(); await p.getByRole('button', { name: 'Next' }).click();
  await p.waitForSelector('.rm-now h1:has-text("France")'); await p.getByRole('button', { name: 'Start' }).click(); await p.waitForSelector('button:has-text("Pause")');
  await d.waitForSelector('.rd-stage h1:has-text("France")', { timeout: 6000 });
  // Room chat: the delegate writes to everyone, the chair reads it.
  await d.getByRole('button', { name: 'Chat' }).click(); await d.getByLabel('Message…').fill('France requests a moderated caucus.'); await d.getByRole('button', { name: 'Send' }).click();
  await p.getByRole('button', { name: 'Chat' }).click(); await p.waitForSelector('text=France requests a moderated caucus.', { timeout: 8000 }); await p.keyboard.press('Escape');
  // Settings save instantly and delegates submit a working paper.
  await p.getByTestId('room-settings').click(); await p.locator('.rm-set-nav > button', { hasText: 'Voting' }).click(); await p.getByRole('radio', { name: /2\/3 Supermajority/ }).click();
  await p.waitForSelector('.rm-choice.on:has-text("2/3 Supermajority")'); await p.keyboard.press('Escape'); await p.locator('.rm-settings .rm-x').click().catch(() => {});
  await d.keyboard.press('Escape'); await d.getByRole('button', { name: 'Documents' }).click(); await d.getByRole('button', { name: /Submit new/ }).click();
  await d.getByLabel('Title *').fill('WP 1: Ocean data sharing'); await d.getByRole('button', { name: 'Submit', exact: true }).click(); await d.waitForSelector('text=WP 1: Ocean data sharing');
  await p.getByRole('tab', { name: 'Documents' }).click(); await p.waitForSelector('text=WP 1: Ocean data sharing', { timeout: 6000 });
  await p.screenshot({ path: `${SHOTS}/09-room-documents.png` });
});

await step('home page: hero, menus, audiences, pricing and FAQ', org, async () => {
  const h = await newPage('home');
  await h.goto(`${B}/`); await h.waitForSelector('text=for Model UN'); await h.waitForSelector('#features');
  await h.locator('.sx-menu').first().hover(); await h.waitForSelector('.sx-menu.open .sx-item:has-text("Live committee room")');
  await h.getByRole('tab', { name: 'Chairs and EB' }).click(); await h.waitForSelector('text=Chair committee from one screen, together');
  await h.getByText('Do delegate fees come to us?').click(); await h.waitForSelector('text=straight into your own account');
  await h.goto(`${B}/#pricing`); await h.waitForSelector('#pricing >> text=Free to run your conference');
  const m = await newPage('home phone', true); await m.goto(`${B}/`); await m.locator('.sx-burger').click(); await m.waitForSelector('.sx-drawer >> text=Explore conferences');
  if (await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('home page scrolls sideways on a phone');
});

// ============ demo workspace: every role, every screen ============
async function signIn(email) {
  const p = await newPage(email);
  await p.goto(`${B}/login`); await p.getByLabel('Email').fill(email); await p.getByLabel('Password').fill('ChangeMe!2026'); await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForTimeout(900);
  if (await p.getByLabel('6-digit code').count()) { const sec = (await p.locator('.mono').first().innerText()).trim(); await p.getByLabel('6-digit code').fill(totp(sec)); await p.getByRole('button', { name: /Turn on/ }).click(); }
  await p.waitForURL(/\/app/); await p.waitForSelector('.side a.nav'); return p;
}
for (const email of ['admin@example.org', 'cfo@example.org', 'accounts@example.org', 'desk@example.org', 'chair.unsc@example.org', 'auditor@example.org']) {
  const p = await signIn(email);
  await step(`demo ${email}: every screen in the menu opens`, p, async () => {
    const links = await p.locator('.side a.nav').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    if (!links.length) throw new Error('no menu');
    for (const l of links) { await p.goto(B + l); await p.waitForTimeout(650); if (await p.locator('.error-box').count()) throw new Error(`error box on ${l}: ` + await p.locator('.error-box').first().innerText()); }
  });
  await p.context().close();
}

await br.close();
console.log('\n==== SUMMARY ====');
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`${results.length - fails.length} passed, ${fails.length} failed`);
for (const f of fails) console.log('FAIL:', f[1], '—', f[2]);
const uniq = [...new Set(problems)]; if (uniq.length) { console.log('\nProblems seen:'); for (const p of uniq.slice(0, 60)) console.log(' -', p); }
fs.writeFileSync(`${DIR}/e2e-report.json`, JSON.stringify({ results, problems: uniq }, null, 1));
