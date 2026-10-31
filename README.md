# DelegateDesk

A Model UN conference platform. Organisers list their conference in a 10-step wizard and get a public page, a registration link and a dashboard; delegates find conferences on Explore and apply; chairs and staff apply from the Job Board; committees run live with roll call, speakers lists, motions and voting. Underneath: instant or reviewed committee/portfolio allotment, payments (bank transfer, UPI QR, payment link, in person, Razorpay, Cashfree), referral commission and Companies Act-ready double-entry books. Built from *Delegate Registration & Event Finance Platform — Full Product Spec*.


## Run it from GitHub

GitHub stores the code; a Node.js host runs it. Pick one:

| Option | What you get | How |
|---|---|---|
| **Render (recommended for a live site)** | A permanent public address that redeploys every time you push to GitHub | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/arnavcodecraft/delegate-desk) Fill in `BASE_URL` (the address Render gives you, or your Cloudflare address), `GEMINI_API_KEY`, and `BREVO_API_KEY` + `MAIL_FROM` for sign-up emails. Leave `PROXY_SECRET` empty unless you put Cloudflare Pages in front. |
| **GitHub Codespaces** | The whole app running inside GitHub, for you and your team to try | On the repository page: **Code → Codespaces → Create codespace**. It installs and opens the app, empty and ready for your first conference. Add `GEMINI_API_KEY` under Settings → Secrets and variables → Codespaces for AI. |
| **Your own PC** | Free, from a download of this repository | Download the ZIP (Code → Download ZIP), unzip, double-click `start.bat`. Add a `.env` with `GEMINI_API_KEY=…` for AI. |

Every push runs the type checks, all tests and a production build (GitHub Actions, `.github/workflows/ci.yml`).

Never commit `.env` or API keys: `.gitignore` keeps them out. Put keys in Render's environment settings or GitHub's Codespaces secrets instead.


## Apps: phone and computer

- **Install from the browser (all devices):** open your DelegateDesk site and choose *Install* (Chrome, Edge, Android) or *Share → Add to Home Screen* (iPhone). The site's `/get-the-app` page explains it. This is a full installable app (PWA) with its own icon and window and an offline page.
- **Android APK and Windows / Mac / Linux apps:** built by GitHub, not on your computer. Go to **Actions → Apps → Run workflow** and enter your site address (or set it once as a repository variable `APP_URL` under Settings → Secrets and variables → Actions → Variables). The files appear under that run's *Artifacts*. Push a tag like `v1.0.0` to publish them as a GitHub Release, which the `/get-the-app` page links to.
- **Play Store:** create a signing key once (`keytool -genkey -v -keystore release.jks -alias delegatedesk -keyalg RSA -keysize 2048 -validity 10000`), then add the repository secrets `ANDROID_KEYSTORE_BASE64` (the file, base64-encoded), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. The workflow then also produces a signed APK and the `.aab` bundle the Play Console asks for. A Google Play developer account (one-time fee) is needed to publish.
- The desktop apps are not code-signed yet, so Windows and Mac show a one-time warning on first launch.

## Quick start

Needs Node.js 22.13 or newer (Windows, macOS or Linux). On Windows you can just double-click `start.bat`: it installs, starts the app (empty, ready for your first conference) and opens the browser.

```bash
npm install
npm run seed -- --demo     # optional: demo organisation, event BGYS27, 45 sample delegates, payments, expenses
npm run reset -- --yes     # delete every conference, account and upload (keeps a backup copy)
npm run stop               # stop a DelegateDesk server that is stuck or paused (Ctrl+Z) and still holds the port
npm run build              # build the web app
npm start                  # http://localhost:8080   (set ALLOW_SANDBOX=1 to use the test gateway in production mode)
# or: npm run dev          # API on :8080 with reload + Vite on :5173
```

| Page | Address |
|---|---|
| Explore conferences (home) | `http://localhost:8080/` |
| List your conference (organiser sign-up + wizard) | `http://localhost:8080/list` |
| Demo conference page | `http://localhost:8080/c/bgys27` |
| Delegate registration form | `http://localhost:8080/register/BGYS27` |
| Job Board | `http://localhost:8080/jobs` |
| Live committee session (start or join) | `http://localhost:8080/session` |
| Staff / organiser sign-in | `http://localhost:8080/login` |

Demo accounts (password `ChangeMe!2026` for all, all `@example.org`):

| Email | Role | Two-factor |
|---|---|---|
| `admin@` | Secretary-General (admin) | set up on first sign-in |
| `cfo@`, `cfo2@` | CFO, deputy CFO (second approver) | set up on first sign-in |
| `accounts@` | Accountant | set up on first sign-in |
| `desk@` | Registration executive | no |
| `chair.unsc@` | Director, UNSC (sees only UNSC) | no |
| `auditor@` | External auditor (read-only) | no |

New organisers create their own account at `/list`: they become admin + CFO of a separate workspace, are signed in straight away, and set up two-factor sign-in at their next sign-in.

Accounts and roles:
- **Organiser team.** Settings → Users & roles → Invite staff emails a one-time link (7 days) to set a password; the link is also shown on screen in case email isn't set up. Roles: Secretary-General/admin, Secretariat (USG/DSG: committees, documents, applications, delegates, emails, check-in; no money), CFO, Accountant, Registration desk, Chair (one committee), Auditor (read-only), Referrer, Head delegate/advisor. "What each role can do" explains them; the permission matrix shows every right. Pending invites show as *Invited* with *Resend invite*; admins can send a reset link. Chairs accepted from Applications get the same invite link.
- **Forgotten passwords.** Staff: "Forgot password?" on `/login` emails a one-hour link. Participants: a 6-digit code.
- **Delegates, advisors and chairs** can create a free account at `/account` (optional: the delegate link in their email still works without one). After confirming their email with a 6-digit code, *My conferences* lists every registration and application made with that email, across all organisers. Registration forms fill themselves in. Email goes through Brevo (`BREVO_API_KEY`), Resend (`RESEND_API_KEY`) or SMTP (`SMTP_URL`), and codes are sent immediately. With no email service, codes are shown on screen only on a local install (`start.bat` sets `ALLOW_DEV_CODES=1`); a live site never shows them. `/setup` checks the whole configuration.

Tests: `npm test` (83 tests: spec worked examples, money flows, permissions, an 8-process concurrent-registration test, and every integration exercised against a local fake that speaks its real protocol: clamd, WhatsApp Cloud API, MSG91, Google OAuth + Sheets, Anthropic Messages; plus workspace isolation, onboarding, review mode, the Job Board, and the live-session voting rules). Typecheck: `npm run typecheck`. Docker: `docker build -t delegatedesk . && docker run -p 8080:8080 -v dd:/data delegatedesk`.

End-to-end test: `npm run e2e` drives a real browser through the whole product against a running demo (start it with `ALLOW_SANDBOX=1`; run `npx playwright install chromium` once). A new organiser signs up and creates *Test Model United Nations* with three committees, sets fees, a coupon and four payment methods, opens applications and publishes; delegates register (instant and reviewed), pay by proof and in person, upload a position paper; an advisor and a chair apply; the chair runs a live session; then check-in, badges, certificates, emails, a refund, an expense, the books, settings and backups; finally every demo account opens every screen in its menu. Screenshots land in `e2e/screenshots/`.

## Where each thing lives (one home per setting)

| What | Page |
|---|---|
| Name, dates, venue, logo, banner, description, contact | Conference page |
| Committees, portfolios, committee descriptions | Committees (one editor for adding and editing) |
| Who can apply, deadline, instant vs reviewed allotment, position papers | Applications → Settings |
| Accepting an applicant and giving a seat | Applications (the delegate record links there) |
| Fees, GST, payment methods (bank, UPI QR, link, in person), fee tiers, coupons, payment rules | Financials (tabs: Payments · Fee tiers · Payment rules) |
| Seat holds, locks, reminders, alerts, dress code, reporting time | Settings → Event rules |
| Organisation, team, integrations, Google Sheets, backups, data protection | Settings |

The event-update API only accepts rules; profile, application and payment fields sent there are refused with a message naming where they belong. Old payment details stored on the organisation are moved into the conference's payment methods at start-up.

Two-person approval (payments, refunds, expenses, manual journals) applies whenever someone else can approve. A solo organiser who is the only person holding the approving role can approve their own entries; each such approval is audited as self-approved.

Look: premium blue and white. A white top bar and a light sidebar with a blue active rail, Plus Jakarta Sans headings over Inter, blue gradients only where they carry meaning (banners, the delegate header, primary buttons), in light and dark. A guided **dashboard tour** runs on an organiser's first visit and can be replayed from the ? button in the sidebar.

## EB marking (live sessions)

Open a committee's console (Live sessions → Start / Open, or `/session`) and switch to **EB marking**. It follows the marksheets EBs keep by hand (marksheet, verbatim and recognition sheets):

- The GSL and each moderated caucus become marksheet columns on their own (GSL, MOD-1, MOD-2 …) when the motion passes; every speaker who takes the floor, or is recognised in a caucus, is a speech to mark (out of 10 by default) with verbatim notes or "noted offline".
- Verbal POIs (asked by → to, with a mark), substantive and POI chits, and marks by hand (lobbying, documentation).
- Attendance per day (P / PV / A) is taken from the roll call and can be edited.
- **Scheme:** start from *Verbatim 80% · Chits 20% · Lobbying · Documentation* or a 100-point scheme; change weights, maxima, which sources feed each criterion, how several speeches in one column combine (average, sum, best), and the award order (Best Delegate, High Commendation, Special Mention, Verbal Mentions).
- **Marksheet** with live totals, ranks and awards; **Recognition** shows who has spoken least, every motion by proposer, and the speakers and POIs in each segment.
- **Export Excel** produces the three sheets (MARKSHEET with working formulas, VERBATIM, RECOGNITION SHEET). **Send awards to certificates** gives each award to the delegate holding that portfolio.
- Marks are only visible on the chair console; the delegate view never receives them. Amendments to drafts (friendly / unfriendly, passed / failed) are tracked on the floor and shown to delegates.

## Prep (for delegates)

`/prep` is a preparation workspace for delegates, advisors and chairs:

- **Research:** questions answered with web search and citations to the sources (UN documents, governments, treaties). **Research projects** for a country, committee and topic, from templates (country brief, position paper, crisis, resolution). Background research tasks (background, past UN action, country policy, voting record, allies and blocs, solutions, likely amendments, actors, powers, scenarios) run in parallel and land in a persistent brief. Research memory (stance, red lines) is used in every answer. Shared projects: invite teammates (edit) or advisors (view); everyone sees who prepared what.
- **Write:** position papers, speeches (opening, GSL, moderated caucus, right of reply, closing), memos, amendments and points of information, with an outline and word budgets at 130 words a minute, the chair's checklist, and a sourced draft.
- **Coach:** live word count, pages, speaking time, limit and missing sections; chair-style rubric feedback that flags unsupported or overstated claims.
- **Practice:** negotiate with an AI delegation, stress-test an argument, interview a historical figure, run a crisis, or get speech feedback; save transcripts to a project.
- **Learn: the MUN Masterclass.** 10 modules and 34 lessons in order, from "what is MUN" to Best Delegate: the Executive Board, roll call (present vs present and voting), procedural and substantive voting, the map of motions, the GSL with a line-by-line 90-second speech, yields, the four points with exact wording, moderated caucuses and subtopics, POI chits, the right to reply, unmoderated caucuses and lobbying, the three kinds of chit, position papers, draft resolution format, sponsors vs signatories, amendments and voting, Indian committees (AIPPM, Lok Sabha, Rajya Sabha, Union Cabinet, crisis), how EBs mark and a three-day game plan. Every lesson has key takeaways, "say it like this" floor scripts, common mistakes, a drill linked to the AI coach, and a quiz. A 25-question final assessment (70% to pass) unlocks a printable certificate.
- **Learn: topic courses.** 14 courses (UN, Security Council, GA, rules of procedure, speeches, position papers, research, resolutions, lobbying, negotiation, international law, human rights, crisis, chairing and marking) with quizzes, a daily challenge and a streak.
- **Discover:** a daily briefing with sources and the committees each story matters to, or a briefing on the topics you follow.
- **Countries:** all 193 members with regional group, capital and blocs (P5, Security Council 2026, G7, G20, BRICS, EU, NATO, AU, ASEAN, Arab League, GCC, OPEC, SCO, SAARC, Quad, Mercosur, Commonwealth), a comparator (with sourced population, GDP and HDI on request) and a bloc builder.
- **MUN tools (no account, nothing leaves the device):** speech timer with presets, cues and notes; speakers list; voting tally (simple, two-thirds, Security Council with veto); quorum calculator; motions reference (US and THIMUN); resolution formatter; resolution symbol decoder; acronym decoder (130+); placard generator; random delegation allocation; packing checklist; position paper counter.

AI features use Claude (`ANTHROPIC_API_KEY`) or Google Gemini (`GEMINI_API_KEY` from AI Studio, with `AI_PROVIDER=gemini`; busy models fall back to lighter ones, and if Google Search grounding isn't available on the key, answers are labelled "No live sources") and are metered per person (`AI_DAILY_LIMIT`, default 50 a day). Without a key every tool that doesn't need AI still works and AI features say so. AI answers can be wrong: open the source.

Configuration lives in environment variables or a `.env` file next to `package.json`; see [`.env.example`](.env.example).

**Cloudflare:** the website goes on Cloudflare Pages (`npm run build:pages`, 157 files) and forwards `/api` to the server running on Render, a VPS or your PC through Cloudflare Tunnel. Step-by-step guide: [`CLOUDFLARE.md`](CLOUDFLARE.md).

## Conference platform (list your conference)

| Feature | Where |
|---|---|
| **Separate workspaces per organiser.** Each organiser who signs up gets their own database, upload folder and books, so delegates, money and GST never mix. A small platform database routes sign-ins (by email), public links (by conference code) and tagged ids/tokens to the right workspace, and holds the Explore listing. The original demo is the "main" workspace. | `server/src/platform.ts`, `server/src/db.ts` |
| **List your conference**: 10 steps: name, acronym, logo, banner, dates or "to be decided"; in person / online / hybrid; high school / university / both; country (flag grid) and city; expected size; committees; description and social links; free or paid (with the fee); what you'll use it for; review and create (with account sign-up). Answers are saved on the device as you go. | `web/src/platform/ListConference.tsx`, `services/conference.ts` |
| **Committee editor**: MUN, Crisis, Custom and Press types; typing a known name (UNSC, UNHRC, DISEC, ECOSOC, WHO, NATO, EU, G20, ICJ, Lok Sabha, AIPPM, IPC, …) fills in the short name, emblem and members/portfolios; topics, difficulty, language, emblem; search with flags, quick bundles (P5, G7, BRICS+, G20, EU, NATO, ASEAN, Arab League, SAARC, GCC), paste a list; delegates per country; A–Z or importance order. Used in the wizard and on the Committees page. | `web/src/platform/CommitteeEditor.tsx`, `web/src/data/` |
| **Public conference page** with banner, logo, dates, venue, format, level, committees with topics, seats left and study guides, fees, open positions, apply buttons per role, share link, QR code and WhatsApp share, socials and contact. Visits are counted by source (`?src=instagram`, referrer). | `web/src/platform/Explore.tsx` |
| **Explore**: search and filter by country, level, format, free/paid and dates; platform stats. **Job Board**: chair, secretariat, staff, press and volunteer roles across all conferences. | `routes/platform.ts` |
| **Organiser dashboard**: Draft/Publish, set-up priorities ordered by what the organiser said they need, applicants against target (delegates, advisors, observers, chairs, staff), where applicants come from, participants over time, shareable links and QR. | `web/src/staff/Organiser.tsx` |
| **Applications**: open/close each role (delegates, faculty advisors, observers, chairs) and a deadline; **instant** allotment or **review** mode (score 1–10, assign a seat by hand or auto-assign by score, decline with a note; nothing is payable until a seat is assigned). Chair/staff/advisor/observer applications with CV upload, shortlist/accept/decline emails, and an optional chair account scoped to their committee. | `services/applications.ts` |
| **Financials set-up**: free or paid; school, university, advisor, early-bird and late fees; GST on/off; payment methods — bank transfer (account, IFSC/SWIFT, reference, instructions), UPI ID or uploaded QR code, external payment link, in person (recorded by the organiser into petty cash). Delegates upload proof; the organiser approves it. Free conferences confirm seats immediately. | `services/conference.ts`, `routes/organiser.ts` |
| **Documents**: study guides per committee (PDF upload or link) and position papers (PDF upload on the delegate page, chair score and feedback, revision requests, deadline). | `services/applications.ts` |
| **Live sessions**: roll call (present / present and voting), quorum, speakers list with timer and requests to speak, motions (moderated/unmoderated caucus, close debate, set agenda…), voting with simple majority, two-thirds and Security Council rules (nine votes, P5 veto), optional voting on delegates' phones. Free for anyone at `/session`, or started from a committee so the room is filled in. | `services/live.ts`, `web/src/platform/Live.tsx` |

New organisers collect fees into their own accounts. The deployment's Razorpay/Cashfree keys and the sandbox test gateway are only offered in the original (main) workspace.

## Site owner console (`/app/owner`)

For the DelegateDesk team: an admin or superadmin of the main workspace, signed in with two-factor.

- **Features**: switch parts of the site on or off: listing new conferences, Explore, the Job Board, live sessions, chat, delegate sign-ups, Prep, the Masterclass, video lectures, AI, Services and app downloads. A switched-off feature drops out of the menus, its pages show a short notice, and the server refuses its requests (403). The owner still sees everything. Nothing is deleted.
- **Maintenance mode**: visitors see a maintenance page with your message and an optional "back by" time, and the API answers 503. Health checks, signing in and the owner's own tools keep working, and the owner can use the whole site.
- **Videos**: add, edit, reorder, publish or unpublish, and delete tutor lectures. Each lecture can be an uploaded MP4 or WebM (up to 500 MB) or a YouTube, Vimeo or https link. It can also have a poster, WebVTT captions, timed chapters and a transcript. Uploads are checked by their contents, not their names, and stored under `UPLOAD_DIR/lectures`. The three demo lectures are loaded the first time.

## What is built (by spec section)

| § | Feature | Where |
|---|---|---|
| 3, 5 | 30-second, no-login mobile form: 8 fields + date of birth, live fee (tier, coupon/group discount, GST), autosaved draft, institution/city/referrer autocomplete, honeypot + rate limit, under-18 parent/school consent | `web/src/pages/Register.tsx`, `services/registrations.ts` |
| 5 | Referral name cleaning, exact match / “did you mean”, unmatched queue, learnt aliases, self-referral flag, edit lock after payment | `services/referrals.ts` |
| 5 | Delegations (head registers many; head pays once or members pay), CSV import | `pages/Other.tsx`, `services/imports.ts` |
| 6 | Razorpay + Cashfree behind one interface, server-fixed amounts, signed + idempotent webhooks, status fetch for late webhooks, routing/default/hide, health-based hiding | `services/gateways.ts`, `services/payments.ts` |
| 6 | Screenshot path: UPI QR + bank details + unique reference, file sniffing/scan, UTR/hash/amount-date duplicate checks, tamper hints, CFO queue (approve / part-payment / resubmit / reject), bank-CSV auto-match and bulk approve, escalation | `services/evidence.ts`, `staff/Payments.tsx` |
| 6, 17 | Statuses, part payments, two-stage fee model, refunds (gateway API or manual with bank ref), maker-checker and two approvers for large refunds, excess payments (refund or transfer), event cancellation bulk refunds | `services/payments.ts` |
| 7 | Allocation engine: preferences → fallback → waitlist, tier by experience, delegation spreading, double-delegation pairing, premium portfolios, seat row lock + unique constraint, holds, expiry, waitlist promotion, swaps with fee difference, lock date, dry-run simulator | `services/allocation.ts` |
| 8 | Templated emails for every trigger (editable, preview, test), transactional outbox, retries, bounce flag, quiet hours, rate limit, unsubscribe, WhatsApp channel hook, bulk send to filtered lists | `services/notify.ts`, `staff/Misc.tsx` |
| 9 | Double-entry ledger with every template from the spec, immutable posted journals (DB triggers), reversals, period/year locks, append-only audit log, GST invoices/credit notes (CGST/SGST/IGST), revenue recognition when the event is held, TDS register, Form 16A data, trial balance, ledgers, day/cash/bank books, Schedule III P&L and balance sheet, GST working, Tally XML/CSV/Excel/PDF/JSON exports | `services/ledger.ts`, `services/journals.ts`, `staff/Books.tsx` |
| 10 | 14 live lists, typo-tolerant search, filters, column picker, saved views, Excel/CSV/PDF, frozen snapshots, expiring read-only share links (minors excluded, Google Sheets `IMPORTDATA` CSV), bulk actions, duplicate finder, attendance and awards | `services/lists.ts`, `staff/Registrations.tsx` |
| 11 | Expenses with bill upload, budget check (80%/100% alerts, hard limit with CFO override), GST/ITC/TDS, approval limits, maker-checker, payments, reimbursements, advances, petty cash and counts, vendor credit notes, recurring copies, duplicate-bill detection, vendor ledger and ageing, sponsorship | `services/expenses.ts`, `staff/Expenses.tsx` |
| 12 | Dashboard: the eight tiles, break-even (mix-weighted, after gateway fee and commission), date at current pace, forecast, what-if scenarios, contribution by committee and referrer, budget vs actual, alerts | `services/dashboard.ts`, `staff/Dashboard.tsx` |
| 13 | Imports (upload → map → preview → confirm, error file, rollback) for registrations, portfolios, bank statements, settlements (drafts), vendors, expenses, referrers, opening balances (two sign-offs) | `services/imports.ts`, `staff/Misc.tsx` |
| 14 | Commission: flat %, flat amount, slab, progressive; count or value basis; base options; event/month/FY periods; caps, minimum payout, per-type plans, CFO-signed overrides; true-ups, refund reversals, held → accrued → approved → paid, TDS with threshold and no-PAN rate, statements and PDFs | `services/commission.ts`, `staff/Referrals.tsx` |
| 6 | Screenshot reading: on-device OCR (Tesseract) pulls UTR, amount and date from UPI/bank screenshots and compares them with what the delegate typed; optional second read by Claude | `services/ocr.ts`, `services/evidence.ts` |
| 8 | WhatsApp Business (Meta Cloud API templates, signed delivery-status webhook) and SMS (MSG91 Flow, DLT) alongside email, per-template provider names and parameters, only to delegates who opted in | `services/channels.ts`, `services/notify.ts` |
| 5 | Optional mobile OTP on the form (WhatsApp or SMS, 3 codes per 15 minutes, signed one-time token) | `services/otp.ts` |
| 10 | Live Google Sheets: any list pushed to a tab on a schedule through a service account; contacts and minors left out unless chosen | `services/sheets.ts`, Settings → Google Sheets |
| 10 | Printable badges (8 per A4, signed QR), certificates with award wording, email certificates, QR/typed check-in with camera scanning, unpaid delegates held at the door, live per-committee attendance | `services/badges.ts`, `staff/CheckIn.tsx` |
| 11 | Bill reading on upload (OCR or Claude): vendor, GSTIN, invoice no., date, GST and total prefilled; purchase orders converted to bills | `services/ocr.ts`, `services/ai.ts`, `staff/Expenses.tsx` |
| 12 | AI assistant: plain-English questions over read-only, permission-scoped tools (dashboard, delegates, lists, trial balance, P&L, expenses, statements, proofs) and a written status note | `services/ai.ts`, `staff/Shell.tsx` |
| 16 | Upload scanning with ClamAV (clamd INSTREAM) on top of type sniffing and PDF active-content checks | `services/scanner.ts` |
| 16 | Encrypted daily backups (database + uploads, AES-256-GCM), restore-tested after every run (decrypt, integrity check, row counts), download, `npm run restore -- file.ddbak [dir]` | `services/backup.ts`, `server/src/restore.ts` |
| 16 | Data protection: erasure requests (erase / decline with reason), breach register with Board notification tracking and plain-language notices to affected delegates | Settings → Data protection |
| 4, 16 | Nine roles with server-side permissions, TOTP 2FA, session timeouts, CSRF header, login log, private files via expiring signed links, minimal data, consent withdrawal and erasure that respects 8-year retention | `server/src/auth.ts` |

## Engineering rules the code enforces

- Money is integer paise everywhere, rounded once per registration.
- `seat.registration_id` is `UNIQUE` and a seat is taken with `UPDATE … WHERE state = 'open'` inside the registration transaction, so double allotment is impossible (tested with 8 processes × 25 simultaneous registrations).
- Webhooks are verified on the raw body, stored, and processed once per event id and once per payment id; captured amounts must match the server-side order.
- Payment, journals, invoices and emails are written in one database transaction (the notification table is the outbox).
- `journal_line`, `journal_entry` (except the reversal link) and `audit_log` reject UPDATE/DELETE at the database level.

## Deliberate choices and limits

- **Database:** SQLite (Node’s built-in `node:sqlite`, WAL mode) instead of PostgreSQL, so it runs with no extra services. All the money rules rely on real transactions and constraints, which SQLite provides. Moving to PostgreSQL means porting `server/src/db.ts` and the schema; run a single app instance against one database file. That port was deliberately left out: it adds a service to run without changing any behaviour, and the encrypted, restore-tested backups cover the durability side.
- **Gateways:** Razorpay follows its documented signature scheme. The Cashfree header names and API version (`2023-08-01`) are what the spec flagged as needing confirmation; check them against Cashfree’s current docs before going live. A built-in sandbox gateway exercises the same signed-webhook path for testing.
- **Integrations switch on with their keys.** WhatsApp, SMS, ClamAV, Google Sheets and AI stay off until their environment variables are set (Settings → Integrations shows what is connected). OCR runs locally and is on by default. A screenshot or an AI reading is never treated as proof: it only flags differences for the person approving.
- **Screenshot reading** works on clear phone screenshots; heavily compressed or cropped images may give nothing, and the proof then shows “nothing could be read”, not a guess.
- **Compliance:** like the spec, this is audit-ready, not certified. GST rate/applicability, revenue recognition, chart of accounts, TDS sections and DPDP obligations must be confirmed by your CA and lawyer; every rate is a setting.
