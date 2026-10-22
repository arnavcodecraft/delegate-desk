# DelegateDesk

Delegate registration, instant committee/portfolio allotment, payments (Razorpay, Cashfree or UPI screenshot with CFO approval), referral commission and Companies Act-ready double-entry books for Model UN–style events. Built from *Delegate Registration & Event Finance Platform — Full Product Spec*.

## Quick start

Needs Node.js 22.13 or newer (Windows, macOS or Linux). On Windows you can just double-click `start.bat`: it installs, loads the demo on first run, starts the app and opens the browser.

```bash
npm install
npm run seed -- --demo     # demo organisation, event BGYS27, 45 sample delegates, payments, expenses
npm run build              # build the web app
npm start                  # http://localhost:8080   (set ALLOW_SANDBOX=1 to use the test gateway in production mode)
# or: npm run dev          # API on :8080 with reload + Vite on :5173
```

- Public form: `http://localhost:8080/register/BGYS27`
- Staff sign-in: `http://localhost:8080/login`, password `ChangeMe!2026` for every seeded user:
  `admin@` (Secretary-General), `cfo@` and `cfo2@` (CFO), `accounts@` (Accountant), `desk@` (Registration exec), `chair.unsc@` (UNSC chair), `auditor@` — all `@example.org`.
  Admin, CFO and Accountant set up two-factor sign-in (any authenticator app) on first sign-in.

Tests: `npm test` (56 tests: spec worked examples, money flows, permissions, an 8-process concurrent-registration test, and every integration exercised against a local fake that speaks its real protocol: clamd, WhatsApp Cloud API, MSG91, Google OAuth + Sheets, Anthropic Messages). Typecheck: `npm run typecheck`. Docker: `docker build -t delegatedesk . && docker run -p 8080:8080 -v dd:/data delegatedesk`.

Configuration lives in environment variables; see [`.env.example`](.env.example).

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
