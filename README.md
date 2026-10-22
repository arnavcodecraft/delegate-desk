# DelegateDesk

Delegate registration, instant committee/portfolio allotment, payments (Razorpay, Cashfree or UPI screenshot with CFO approval), referral commission and Companies Act-ready double-entry books for Model UN–style events. Built from *Delegate Registration & Event Finance Platform — Full Product Spec*.

## Quick start

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

Tests: `npm test` (32 tests: spec worked examples, money flows, permissions, and an 8-process concurrent-registration test). Typecheck: `npm run typecheck`. Docker: `docker build -t delegatedesk . && docker run -p 8080:8080 -v dd:/data delegatedesk`.

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
| 4, 16 | Nine roles with server-side permissions, TOTP 2FA, session timeouts, CSRF header, login log, private files via expiring signed links, minimal data, consent withdrawal and erasure that respects 8-year retention | `server/src/auth.ts` |

## Engineering rules the code enforces

- Money is integer paise everywhere, rounded once per registration.
- `seat.registration_id` is `UNIQUE` and a seat is taken with `UPDATE … WHERE state = 'open'` inside the registration transaction, so double allotment is impossible (tested with 8 processes × 25 simultaneous registrations).
- Webhooks are verified on the raw body, stored, and processed once per event id and once per payment id; captured amounts must match the server-side order.
- Payment, journals, invoices and emails are written in one database transaction (the notification table is the outbox).
- `journal_line`, `journal_entry` (except the reversal link) and `audit_log` reject UPDATE/DELETE at the database level.

## Deliberate choices and limits

- **Database:** SQLite (Node’s built-in `node:sqlite`, WAL mode) instead of PostgreSQL, so it runs with no extra services. All the money rules rely on real transactions and constraints, which SQLite provides. Moving to PostgreSQL means porting `server/src/db.ts` and the schema; run a single app instance against one database file.
- **Gateways:** Razorpay follows its documented signature scheme. The Cashfree header names and API version (`2023-08-01`) are what the spec flagged as needing confirmation; check them against Cashfree’s current docs before going live. A built-in sandbox gateway exercises the same signed-webhook path for testing.
- **Not included:** OCR of screenshot images (UTR/amount are read only from text PDFs), a WhatsApp/SMS provider (the channel and templates exist; plug a BSP into `notify.ts`), ClamAV (PDFs with active content are rejected; hook point in `evidence.ts`), live Google Sheets sync (use the share-link CSV with `IMPORTDATA`), and AI assistance (phase 5 in the roadmap).
- **Compliance:** like the spec, this is audit-ready, not certified. GST rate/applicability, revenue recognition, chart of accounts, TDS sections and DPDP obligations must be confirmed by your CA and lawyer; every rate is a setting.
