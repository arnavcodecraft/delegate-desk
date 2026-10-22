# DelegateDesk

A Model UN conference platform. Organisers list their conference in a 10-step wizard and get a public page, a registration link and a dashboard; delegates find conferences on Explore and apply; chairs and staff apply from the Job Board; committees run live with roll call, speakers lists, motions and voting. Underneath: instant or reviewed committee/portfolio allotment, payments (bank transfer, UPI QR, payment link, in person, Razorpay, Cashfree), referral commission and Companies Act-ready double-entry books. Built from *Delegate Registration & Event Finance Platform — Full Product Spec*.

## Quick start

Needs Node.js 22.13 or newer (Windows, macOS or Linux). On Windows you can just double-click `start.bat`: it installs, loads the demo on first run, starts the app and opens the browser.

```bash
npm install
npm run seed -- --demo     # demo organisation, event BGYS27, 45 sample delegates, payments, expenses
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

New organisers create their own account at `/list`: they become admin + CFO of a separate workspace, are signed in straight away, and set up two-factor sign-in at their next sign-in. Chairs accepted from Applications get an account by email with a temporary password. Delegates never need a password; they use the link in their email.

Tests: `npm test` (70 tests: spec worked examples, money flows, permissions, an 8-process concurrent-registration test, and every integration exercised against a local fake that speaks its real protocol: clamd, WhatsApp Cloud API, MSG91, Google OAuth + Sheets, Anthropic Messages; plus workspace isolation, onboarding, review mode, the Job Board, and the live-session voting rules). Typecheck: `npm run typecheck`. Docker: `docker build -t delegatedesk . && docker run -p 8080:8080 -v dd:/data delegatedesk`.

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

Look: navy and gold "summit" theme with Playfair Display headings across public pages, the delegate page and the staff app, in light and dark.

Configuration lives in environment variables; see [`.env.example`](.env.example).

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
