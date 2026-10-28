# DelegateDesk: UI design brief (blue theme)

Everything a designer, or an AI UI generator such as v0, Lovable, Bolt or Figma AI, needs to design the whole app. Each screen, field, state and rule here comes from the working app. A ready-to-paste prompt is at the end.

---

## 1. What the product is

DelegateDesk is a platform for running **Model United Nations (MUN) conferences**, built for India. Amounts are in ₹, with GST and UPI, and it works on phones first.

There are three kinds of user:

1. **Organisers** (a school or college MUN society) list a conference in a 10-step wizard. They get a public conference page, a registration link and a dashboard for running everything: applications, seat allotment, payments, emails, check-in, certificates, live committee sessions and full accounting.
2. **Delegates, faculty advisors, observers and chairs** find conferences on **Explore**, apply, pay and track their status. They need no account: each person gets a private link.
3. **Committee chairs** run live sessions (roll call, speakers list, motions, voting). Delegates follow along on their phones.

**Personality:** trustworthy, official, calm. It should feel like a diplomatic summit, but stay modern and simple. Many users are 15–22-year-old students on phones. Organisers are students too, often working alone on a laptop late at night.

**Design goals, in order:**
1. Clarity. One obvious next action per screen.
2. Trust. Money and personal data are involved.
3. Speed on cheap Android phones.
4. Polish.

---

## 2. Roles (who sees what)

| Role | Sees |
|---|---|
| Admin / Secretary-General | Everything except approving money unless also CFO. Two-factor sign-in is required. |
| CFO | All finance, approvals, books. Two-factor sign-in is required. |
| Accountant | Payments, expenses and books, without final approval. Two-factor sign-in is required. |
| Registration executive (desk) | Applications, delegates, lists, check-in. No money settings. |
| Chair / committee director | Only their own committee: delegates, position papers, live session console. |
| External auditor | Read-only everything, including the audit trail. |
| Referrer / ambassador | Their own referral statement (via a private link). |
| Head delegate / advisor | Their school delegation portal (via a private link). |
| Delegate (public) | Their own delegate page via a private link. |

The navigation must hide anything the role can't use. Never show disabled menu items.

---

## 3. Information architecture

### 3a. Public site (top floating pill nav)
The nav is a centred floating pill holding the logo, "Start Session", "List your Conference", "Explore", "Job Board" and a "Sign in" or "Dashboard" button.

| Route | Screen |
|---|---|
| `/`, `/explore` | **Explore**: searchable grid of conference cards with filters |
| `/c/:slug` | **Conference page**: the public page for one conference |
| `/jobs` | **Job Board**: open chair, secretariat and press roles across all conferences |
| `/list` | **List your conference**: organiser sign-up plus the 10-step wizard |
| `/register/:code` | **Delegate registration form** |
| `/register/:code/delegation` | **School delegation registration** (one teacher registers many students) |
| `/r/:token` | **Delegate page** (private) |
| `/application/:token` | Application status for advisors, observers and chairs |
| `/delegation/:token` | School delegation portal |
| `/referrer/:token` | Referrer earnings statement |
| `/share/:token` | Shared read-only list (e.g. for a teacher) |
| `/consent/:token` | Parent or guardian consent page for minors |
| `/session` | Start or join a live session by code |
| `/session/:code` | Live session, delegate view (phone) |
| `/session/:code/chair` | **Chair console** (laptop or projector) |
| `/privacy` | Privacy policy |
| `/login` | Staff sign-in, two-factor set-up and code entry |

### 3b. Organiser / staff app (`/app/…`): left sidebar plus content
At the top of the sidebar: the logo and a **conference switcher** dropdown (e.g. "TMUN27 · Test Model United Nations"). Grouped navigation follows:

- **Overview**
  - Dashboard
- **Manage**
  - Applications
  - Delegates
  - Committees
  - Documents
  - Live sessions
  - Lists
  - Check-in
- **Communicate**
  - Communications
- **Money**
  - Finance overview
  - Financials
  - Payment proofs
  - Payments & refunds
  - Referrals
  - Expenses
  - Books
- **Settings**
  - Conference page
  - Job Board
  - Settings
  - Import
  - Audit trail

At the bottom of the sidebar: the account (name, role), a theme toggle (light, dark, system) and sign out.

On phones, the sidebar collapses into a drawer behind a hamburger. A top bar shows the page title.

**Rule: every setting has exactly one home.** Never show the same setting in two places. Use these owners:

| What | Lives on |
|---|---|
| Name, dates, venue, logo, banner, description, contact | Conference page |
| Committees, portfolios (countries or roles), committee descriptions | Committees |
| Who can apply, deadline, instant vs reviewed allotment, position papers | Applications → Settings tab |
| Accepting an applicant and giving a seat | Applications |
| Fees, GST, payment methods, fee tiers, coupons, payment rules | Financials (tabs: Payments · Fee tiers · Payment rules) |
| Seat holds, locks, reminders, alerts, dress code, reporting time | Settings → Event rules |
| Organisation, team, integrations, Google Sheets, backups, data protection | Settings (tabs) |

---

## 4. Every screen in detail

### PUBLIC

**Explore (home)**
- **Hero:** headline, search box, and the call to action "List your conference".
- **Filters (chips):** format (In person / Online / Hybrid), level (Beginner / Intermediate / Advanced), city, month, free or paid.
- **Conference card:**
  - banner image or generated pattern, round logo, short name (e.g. "TMUN"), full name
  - dates, city with a country flag, format icon, audience ("High school & university")
  - "from ₹1,600" and "x seats open"
- **States:** empty ("No conferences match"), loading skeleton cards.

**Conference page `/c/:slug`**
- **Cover:** wide banner with a gold or accent underline, an overlapping round logo, the organiser name as a small uppercase eyebrow, a large serif short name and the full name. A meta row shows 📅 dates · 🇮🇳 venue, city · format · audience.
- **Left column:**
  - **About:** rich text.
  - **Committees:** count and seat total. Each row shows an icon, short name and full name (e.g. "UNSC · Security Council"), level, "15 of 15 seats open", a description, a fill bar and a "Study guide" button if uploaded.
  - **Open positions:** e.g. "Director, UNSC · Chair", each with an Apply button.
  - **Fees:** tier rows such as "Early bird · School delegates · until 31 Dec 2026 · ₹1,600" and "Regular · ₹2,000".
- **Right sticky column:**
  - **Apply card:** "Delegate fee from ₹1,600", primary "Apply as a delegate →", secondary "Apply as a faculty advisor" and "Apply as an observer", and the link "Registering a whole school delegation?".
  - **Share card:** copyable link, QR code, WhatsApp share, "Download QR".
  - **Contact card:** email.
  - A small line: "0 registered · 100 expected".
- **States:** applications closed, deadline passed, full or waitlist, draft preview (banner "Only you can see this").

**Job Board `/jobs`**
- A list of roles across conferences, with filters by role type and city.
- The apply form asks for name, email, mobile, role, committee preference, experience, a CV upload (PDF) and a note.

**List your conference `/list` (organiser onboarding)**
- **Sign-up first:** name, email, password (10+ characters), organisation name.
- **The wizard** has 10 steps with progress dots and Back and Continue buttons. It is full-screen, one question per step, with big tappable option cards.
  1. **Conference:** full name, short name (auto-suggested), dates.
  2. **Format:** In person / Online / Hybrid, as big cards with icons.
  3. **Level and audience:** Beginner / Intermediate / Advanced; school / university / both.
  4. **Where:** venue, city, country with a flag.
  5. **Size:** expected delegates (slider or number).
  6. **Committees:** type a committee name (e.g. "UNSC") and the portfolios (countries) fill in automatically from a built-in library. Each committee card shows editable chips for portfolios. Add or remove portfolios, and add custom committees.
  7. **About:** description, logo upload, banner upload.
  8. **Pay:** free or paid. If paid: regular fee, early-bird fee with end date, GST on or off. Then choose payment methods (multi-select cards: Payment link, Payment QR code (UPI), Bank transfer, In-person payment), with one sub-step per chosen method: payment page URL; UPI ID; account name, number, IFSC/SWIFT; in-person instructions.
  9. **Uses:** "What do you need help with?" as six colourful option cards (Applications & Allocations, Payments, Running Committees, Emails, Recruiting Chairs, Marketing) plus "Select all". This reorders the dashboard priorities.
  10. **Review:** summary of everything, then "Create conference". A success screen follows with the public link and registration link.

**Delegate registration `/register/:code`** (phone-first, single column)
- **Header:** conference name and dates.
- **Fields:**
  - Full name; Email; Mobile (WhatsApp), with an optional OTP verification code
  - School or college (autocomplete); Class or year (select); City; Date of birth
  - If under 18: Parent / guardian / school contact name, plus their email
  - **Committee preference:** ranked chips, tap in order, and they show 1, 2, 3
  - Why do you want to attend?; How did you hear about us?; Referred by
  - Coupon code (collapsed under "Have a coupon code?")
  - "I agree" consent checkbox
- **Live price line:** fee minus coupon, plus GST.
- **Primary button:** "Register" when seats are given instantly, or "Send my application" when applications are reviewed.
- **Validation:** inline errors under each field. On submit it scrolls to the first error.

**Delegate page `/r/:token`** (phone-first; this is the most important public screen)
- **Header band:** eyebrow "YOUR DELEGATE PAGE", conference name in serif, "Aisha Delegate · Delegate ID TMUN27-R-000001".
- **Allotment card:** status pill ("Registered — here is your allotment"), committee ("Security Council"), a large portfolio ("Pakistan"), a status badge (Provisional / Confirmed) and a countdown ("Pay within 47 h 59 min to keep this seat"). A progress stepper reads Registered → Allotted → Paid → Profile.
  - When under review, it shows "Application under review" and no payment section.
- **Position paper:** due date badge, "Upload PDF", then Submitted, Feedback from chair, or Resubmit.
- **Pay card:**
  - Amount, plus one block per method the organiser enabled:
    - **Link:** "Open the payment page ↗".
    - **UPI:** UPI ID, payee name, QR code, "Scan with any UPI app".
    - **Bank:** account name, number and IFSC, each with a Copy button, plus a remark field ("write TMUN27-R-000001 in the payment note").
    - **In person:** the organiser's instructions and "Quote your delegate ID".
  - **Upload proof:** screenshot or PDF, transaction reference (UTR), amount paid, date paid, and "Submit payment proof".
  - After submitting: "Payment proof under review". After approval: "Confirmed".
- **Payment summary:** registration fee, discount, GST, total, paid, balance due, a status badge, and "Allotment letter" / "Invoice" downloads.
- **Your details:** read-only list with an Edit button; it locks after the details-lock date.
- **Need a change?** "Request a committee change" and "Cancel my registration" (danger, with a refund-policy note).
- **Your data:** privacy note and "Withdraw consent and request erasure".
- **On the day:** QR ticket for check-in, badge and certificate downloads after the event.

**Live session, delegate view `/session/:code`** (phone)
- Committee name, current mode (Moderated caucus / Unmoderated / General speakers list / Voting), a big timer, the current speaker and the speakers list.
- **Buttons:** "Ask to speak" and "Raise a motion".
- **When a vote opens:** full-screen For / Against / Abstain buttons. Results appear after.

**Chair console `/session/:code/chair`** (laptop or projector, three columns)
- **Top:** mode eyebrow, "UNSC · Security Council", agenda topic input, the join code shown huge ("P69T8X") with "Copy link", and End.
- **Left: Roll call.** "15/15 · quorum" badge, "All present" and "Reset" buttons, then one row per country with a flag, the name, a ★ for veto holders and an A / P / PV segmented toggle.
- **Centre:**
  - A huge timer (e.g. "10:00") with Pause, Reset, Next speaker and Custom; speaking time in seconds.
  - Speakers list: add a present delegation, then drag to reorder.
  - Log: a timestamped list of events.
- **Right:**
  - Motions: type, total minutes, speaking seconds, topic, "Add motion", and the list of motions to vote on.
  - Voting: what is being voted on, substantive or procedural, the majority rule, "Delegates vote on their phones", and "Open vote". A result card shows "15 for · 0 against · 0 abstain" and "Passes, needed 8 of 15".
- **Footer:** "Delegates see changes within two seconds. ★ marks veto holders."

### ORGANISER / STAFF APP

**Dashboard (Overview)**
- **Page head:** conference name with a status badge (Draft / Live / Held / Cancelled), dates, city, "View page ↗", and a Publish or Unpublish button.
- **Alerts:** warn when it's a draft ("not on Explore, form closed"); info when no payment method is set ("Set up Financials").
- **Set-up priorities card:** a "3/7" badge and checklist rows with icon, title and one-line detail. Done rows show a green check and strike-through. Rows are ordered by the wizard's "uses" answers:
  - Add committees
  - Add financial information
  - Launch applications
  - Set up your conference page
  - List chair positions
  - Check your emails
  - Share your link
  - Under the list: the share block with copy boxes for the conference page and the registration form, a QR code, and the tip "add `?src=instagram` to track sources".
- **Applicants against target:** a donut (0 of 100), plus rows for Delegates (with a seat, confirmed), Faculty advisors, Observers, Chairs and Secretariat. Link "Review applications →".
- **Where applicants come from:** bar chart by source (instagram, whatsapp, school…).
- **Participants over time:** line chart.

**Applications**
- **Tabs:** Delegates · Advisors · Observers · Chairs · Press · Settings.
- **Table:** name, school, preferences, applied date, score select (1–10), status, and actions "Accept & assign", "Waitlist" and "Reject".
- **"Accept & assign" modal:** pick a committee and an open portfolio (radio list of seats), then Assign.
- **Settings tab:**
  - who can apply (switches)
  - application deadline
  - allotment: "Instantly, by preference" or "After we review applications" (segmented control)
  - position papers on or off, and the due date

**Delegates (Registrations)**
- **Table:** ref, name, school, committee and portfolio, payment status, amount paid / due, source, created.
  - Search, filters by status, committee and payment, bulk select, and CSV export.
- **Delegate detail:**
  - Header with name, ref and status pills.
  - Cards for profile, allotment ("Move", or "Review in Applications" if not yet accepted), the payment ledger, documents, the message history and the audit timeline.
  - Actions: record payment, refund…, resend link, cancel.

**Committees (Allocation)**
- One card per committee: name, level, seats filled / total, an Edit button and a hint "Add or remove portfolios with Edit".
- A seat grid of portfolio chips coloured by state (open / held / taken / confirmed).
- **One editor modal** for adding or editing a committee: name, short name, description ("About this committee"), level, and the portfolio chips.

**Documents:** study guides per committee (PDF upload), position papers inbox (filter by committee, status, chair feedback), and resources.

**Live sessions:** a list of sessions per committee with "Start session", "Open console" and the history.

**Lists:** saved lists (e.g. "UNSC confirmed delegates"). Each list has a filter builder, export to CSV, Excel or PDF, a share link and a Google Sheets live sync.

**Check-in:** a big camera QR scanner plus manual search. The result card shows a green ✓ "Checked in: Aisha Delegate · UNSC · Pakistan" or a red "Not paid" / "Already checked in". A live counter shows "142 / 180 checked in". There are badge printing and certificate generation buttons.

**Communications**
- **Tabs:** Compose · Templates · History.
- **Audience picker:** everyone, a committee, unpaid, confirmed, advisors…
- **Channels:** email, WhatsApp, SMS.
- Templates come with merge fields such as `{name}` and `{portfolio}`.
- Delivery status badges: sent, bounced, suppressed.

**Finance overview:** stat tiles (collected, pending, refunds, expenses, net, GST payable), a break-even meter, collections over time, budget-vs-actual bars by category, and alerts.

**Financials**
- **Tabs:** Payments · Fee tiers · Payment rules.
  - **Payments:** a summary of chosen methods with a "Change set-up" button, which reruns the wizard's pay steps. Also "Record an in-person payment" (delegate ID, amount, note).
  - **Fee tiers:** a tiers table (name, audience, amount, valid until) and coupons (code, % or ₹, uses, expiry).
  - **Payment rules:** refund window, large-refund threshold, group discounts, application fee, SAC code.

**Payment proofs (review queue):** cards or a split view. On the left, the proof image or PDF with zoom. On the right, the delegate, expected amount, reference, OCR-read amount and UTR with a match indicator, and buttons Approve / Ask to resubmit / Reject.

**Payments & refunds**
- **Tabs:** Refunds · Transactions · Orders · Settlements · Excess payments · Bank lines · Webhook log · Gateways.
- **Refund rows:** Approve / Reject / Mark paid (bank reference). Shows the requested-by and approved-by names.

**Referrals:** referrers or ambassadors with their links, signups, commission earned and paid, and payout actions.

**Expenses:** expense list (category, description, bill date, amount, status submitted → approved → paid), bill upload with OCR auto-fill, an approve flow, and "Pay" (mode, reference, date).

**Books (accounting):** tabs for journal, ledger, trial balance, profit & loss, balance sheet and GST report, plus manual journal entry with approval. Number columns are right-aligned, with debit and credit totals.

**Conference page (settings):** the edit form for the public page with a live preview: name, short name, dates, venue, city, format, level, description, logo, banner, contact email, social links.

**Job Board (organiser):** "Post a director role for each committee" in one click, a roles table, and an applicants inbox with accept (create a chair account) or reject.

**Settings**
- **Tabs:** Event rules · Organisation · Users & roles · Integrations · Google Sheets · Backups · Data protection.
  - **Event rules:**
    - seat hold hours, grace hours, warning hours
    - max delegates per school per committee
    - allocation lock date, details lock date, mobile OTP on or off
    - reminder and escalation hours, dress code, reporting time
    - action buttons: send event reminders, mark event as held, cancel event (danger)
  - **Users & roles:** an info note on split money rights, "+ Invite staff" (name, email, role, committee), a permission matrix and a users table with deactivate and reset-password actions.
  - **Integrations:** cards with connected / not connected states for Email (SMTP), WhatsApp, SMS, Google, AI assistant and the malware scanner.
  - **Backups:** "Back up now", the backup list with a "Restore test passed" badge, and the schedule.
  - **Data protection:** erasure requests, retention periods and a consent log.

**Import:** a CSV upload wizard (upload → map columns → preview with errors → import) for delegates, bank statements, portfolios and referrers.

**Audit trail:** an immutable log table (time, user, action, entity, before/after diff in an expandable row). Filters for user, action and date.

**Account:** name, password change, two-factor management, theme.

**Login:** a centred card on a blue gradient band, with email and password. Then either two-factor set-up (QR plus secret plus 6-digit code) or a 6-digit code entry with an auto-advancing one-time-code input.

---

## 5. Key user flows (design these end to end)

1. **An organiser goes from zero to live in 10 minutes.**
   - Steps: sign up → wizard → dashboard (draft) → set up Financials → Publish → share the link.
2. **A delegate registers and pays, with instant allotment.**
   - Steps: Explore → conference page → register → delegate page (portfolio shown, countdown) → pay via UPI QR → upload a screenshot → "under review" → organiser approves → "Confirmed" (email and WhatsApp).
3. **Reviewed allotment.**
   - Steps: the delegate applies → "Application under review" → the organiser scores, then accepts and assigns a seat → the delegate sees a provisional seat and pays.
4. **A chair is recruited.**
   - Steps: Job Board → apply with CV → organiser accepts → the chair gets an account → signs in → sees only their committee → runs a live session.
5. **Conference day.**
   - Steps: check-in scanner at the door → chair console on the projector → delegates vote on their phones → certificates afterwards.
6. **Money with a check.**
   - Steps: refund request → approval (a second person if available) → bank reference recorded → appears in the books.

---

## 6. Data and status vocabulary (for badges)

Status badges always use the same colour per meaning:

| Tone | Statuses |
|---|---|
| **Good (green)** | paid, confirmed, approved, processed, posted, sent, captured, verified, linked |
| **Warn (amber)** | pending, held, requested, draft, part_paid, part_refunded, refund_requested, unmatched, unpaid, resubmit |
| **Info (blue)** | submitted, processing, queued, waitlisted, accrued, provisional, applied |
| **Bad (red)** | failed, rejected, expired, released, bounced, cancelled, refunded, suppressed, excess |

**Other formats:**
- **IDs:** delegate IDs look like `TMUN27-R-000001`; event codes like `TMUN27`; session codes like `P69T8X` (show them in a monospace font, letter-spaced).
- **Money:** always shown as `₹1,600` in Indian grouping (₹1,00,000). Stored internally in paise.
- **Dates:** "19 Feb – 21 Feb 2027"; times "3:23 pm".
- **Countries:** always show a flag next to the name (use the flag-icons library).

---

## 7. Design system (blue)

### 7a. Colour tokens

**Light mode**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F5F8FF` | page background (very light blue-white) |
| `--surface` | `#FFFFFF` | cards |
| `--surface-2` | `#EEF3FC` | inputs, hover, secondary blocks |
| `--border` | `#DCE4F2` | hairlines |
| `--border-strong` | `#C3D0E6` | input borders |
| `--text` | `#0B1A33` | primary text (navy-black) |
| `--text-2` | `#42516B` | secondary text |
| `--text-3` | `#7A88A1` | hints, placeholders |
| `--brand-900` | `#0A1F4D` | sidebar, hero bands, headings on light |
| `--brand-700` | `#1238A8` | primary button hover |
| `--brand` | `#1D4ED8` | **primary** (buttons, links, active nav, focus) |
| `--brand-400` | `#3B82F6` | charts, highlights |
| `--brand-soft` | `#E3ECFF` | selected rows, active nav background, info alerts |
| `--accent` | `#0EA5E9` | sky-blue secondary accent (live indicators, progress) |
| `--good` / `--good-soft` | `#0E9F6E` / `#E3F8EF` | success |
| `--warn` / `--warn-soft` | `#B7791F` / `#FDF3DC` | warnings |
| `--bad` / `--bad-soft` | `#D92D20` / `#FDECEA` | errors, danger |
| `--sidebar-bg` | `linear-gradient(180deg, #0A1F4D 0%, #0D2A66 100%)` | staff sidebar |
| `--sidebar-text` / `--sidebar-muted` | `#E6EDFB` / `#8FA3C8` | sidebar text |
| `--sidebar-active` | `rgba(59,130,246,.18)` plus a 3px `#60A5FA` left bar | active nav item |

**Dark mode**

| Token | Value |
|---|---|
| `--bg` | `#060D1F` |
| `--surface` | `#0D1730` |
| `--surface-2` | `#13203F` |
| `--border` | `#1F2E52` |
| `--text` / `--text-2` / `--text-3` | `#EAF0FF` / `#A9B6D3` / `#7584A6` |
| `--brand` | `#4F8BFF` (brighter for contrast) |
| `--brand-soft` | `rgba(79,139,255,.14)` |
| `--sidebar-bg` | `#081230` |

**Hero and banner gradient:** `linear-gradient(135deg, #0A1F4D 0%, #1D4ED8 60%, #3B82F6 100%)`, with an optional subtle dot-grid pattern at 6% opacity and a thin 3px `#60A5FA` underline.

**Chart series, in order:** `#1D4ED8`, `#0EA5E9`, `#6366F1`, `#14B8A6`, `#F59E0B`, `#EC4899`.

All text and background pairs must meet WCAG AA (4.5:1 for body text, 3:1 for large text and icons).

### 7b. Typography
- **Display and headings:** *Playfair Display* (serif, gives the diplomatic feel), used for page titles, the conference name and hero text. Alternative for a more modern look: *Plus Jakarta Sans* at 700.
- **UI and body:** *Inter* (variable). Body 14–15px in the app, 16px on public and phone pages.
- **Monospace:** *JetBrains Mono* for IDs, codes, UTRs and account numbers.
- **Scale:**
  - Text: 12 / 13.5 / 15 / 17 / 20 / 24 / 32 / 44 / 60px.
  - Eyebrow labels are 11–12px, uppercase, letter-spacing .08em, in brand blue.
- **Numbers:** tabular numerals in tables and money.

### 7c. Shape, spacing, elevation
- **Spacing:** a 4px base (4, 8, 12, 16, 20, 24, 32, 48, 64).
- **Radius:**
  - 8px for inputs and small buttons
  - 12px for buttons
  - 16px for cards
  - 24px for hero and cover panels
  - pill for badges, chips and the public nav
- **Shadows** are soft and blue-tinted:
  - cards `0 1px 2px rgba(10,31,77,.06), 0 4px 16px rgba(10,31,77,.06)`
  - modals `0 24px 64px rgba(10,31,77,.25)`
- **Width:** content max 1200px on public pages. In the app, a sidebar of 248px plus fluid content.

### 7d. Components to design
- **Buttons:**
  - primary (solid blue, white text)
  - secondary (white with blue border)
  - ghost
  - danger (red)
  - success
  - sizes sm, md, lg
  - icon left; loading state ("Working…" with a spinner)
  - disabled
- **Inputs:** text, email, tel with a +91 prefix, number, date, select, textarea, file upload dropzone, a 6-digit OTP input, an autocomplete (Suggest) and a copy box (read-only value plus a Copy button).
- **Controls:** switch, checkbox, radio list, segmented control, ranked preference chips (showing 1, 2, 3), tag and portfolio chips with ×.
- **Layout:** card (with header, actions, a "flush" table variant), tabs (underline style), modal (title, body, footer actions; information-only modals have just one button), drawer, toast (bottom-right; success, error, info).
- **Feedback:** alert (info, warn, bad, good, each with an icon), status badge, stat tile (label, big value, sub-line, icon, tone).
- **Data tables:** sortable, row click, selectable, sticky header, right-aligned number columns, empty and loading states. On phones they collapse to stacked cards.
- **Charts:** bar, line, donut, budget bars.
- **Pickers and progress:** stepper or progress dots; wizard option cards (large icon tile, title, one line of text, a selected state with a blue ring and a check).
- **Domain pieces:**
  - committee card with a seat fill bar
  - portfolio seat grid
  - flag plus country row
  - QR block
  - countdown timer pill
  - big session timer
  - vote buttons
- **Empty states:** icon, title, one line, one action. **Skeleton loaders** shaped like the real content.
- **Error box:** red, with the message and Retry.

### 7e. Iconography and imagery
- **Icons:** lucide-react, 1.75px stroke, 16–20px in the UI, 24px+ in wizard cards.
- **Committee icons:** shield (UNSC), landmark (parliaments), newspaper (press), globe (General Assembly), scale (ICJ), heart pulse (WHO), each on a coloured circular tile.
- **Conferences without a banner** get a generated blue geometric pattern, and a logo fallback of the short name in a circle.

### 7f. Motion
- 150–200ms ease-out on hovers, tabs and toasts. Modals fade and scale up from 98%.
- The countdown and live session update smoothly with no layout jump.
- Respect `prefers-reduced-motion`.

---

## 8. Content and tone rules
- Use plain, friendly British/Indian English: "Registration fee", "Delegate ID", "Pay within 47 h to keep this seat".
- Buttons say exactly what happens: "Submit payment proof", "Accept & assign", "Back up now". Never "Submit" or "OK" on their own.
- Every empty state says what to do next.
- Error messages say what went wrong and how to fix it. Never show raw codes.
- Money actions show the amount on the button or in a confirmation: "Approve refund of ₹1,800?".

## 9. Accessibility and responsiveness
- **Keyboard:** fully keyboard-usable, with a visible 2px blue focus ring (`outline: 2px solid #3B82F6; outline-offset: 2px`).
- **Touch targets:** at least 44×44px on phones.
- **Labels:** every input has a visible label. Colour is never the only signal (badges have text, votes have labels).
- **Breakpoints:**
  - 360–480px (phone; delegate pages, registration, live session voting)
  - 768px (tablet; check-in)
  - 1024px and up (staff app)
  - 1440px (chair console on a projector)
- **Phone layouts:** the public nav becomes a compact bar with a menu. The conference page's right column moves below the cover, and a sticky "Apply" bar sits at the bottom.
- **Themes:** light and dark both fully designed, with a system default.

## 10. Technical constraints (so designs are buildable)
- **Stack:** React 18, React Router, plain CSS with custom properties (no Tailwind in the current code; Tailwind is fine for a redesign if the tokens map 1:1). Icons from lucide-react; flags from flag-icons; QR from qrcode. Fonts via @fontsource.
- **Theme switching:** a `data-theme="light|dark"` attribute on `<html>`, with a system default.
- **Speed:** fast on low-end Android. Avoid heavy images and blur effects on long lists.

---

## 11. Ready-to-paste prompt for a UI generator

> Design a complete, modern, responsive web app called **DelegateDesk**, a platform for organising Model United Nations conferences in India (₹, GST, UPI). Use a **blue** design system:
> - **Colours:** primary `#1D4ED8`, deep navy `#0A1F4D` for the sidebar and hero bands, sky accent `#0EA5E9`, page background `#F5F8FF`, white cards with soft blue-tinted shadows and 16px radius, and status colours green `#0E9F6E`, amber `#B7791F`, red `#D92D20`.
> - **Type:** Playfair Display for headings (a diplomatic-summit feel) and Inter for UI.
> - **Themes:** include a full dark mode (bg `#060D1F`, cards `#0D1730`, primary `#4F8BFF`).
> - **Overall feel:** trustworthy, calm, official yet friendly for students; one clear primary action per screen; mobile-first for public pages.
>
> **Public site** (floating pill navigation: Start Session, List your Conference, Explore, Job Board, Sign in):
> 1. **Explore:** search and filter a grid of conference cards (banner, round logo, dates, city with flag, "from ₹1,600", seats open).
> 2. **Conference page:** banner cover with overlapping logo and serif title; About; Committees list with seat fill bars and study guides; Open positions; Fees table; and a sticky right column with "Apply as a delegate", a share card (link, QR, WhatsApp) and contact.
> 3. **A 10-step organiser onboarding wizard**, one question per screen with big option cards and progress dots: conference, format, level, where, size, committees (type "UNSC" and the countries auto-fill as editable chips), about, payments (free or paid, early bird, GST, choose payment link / UPI QR / bank transfer / in person), "what do you need help with" (6 colourful cards), review.
> 4. **Delegate registration form** (phone): name, email, mobile, school, class, city, date of birth, ranked committee preference chips, coupon, consent, live price.
> 5. **Private delegate page** (phone): an allotment card with a big portfolio name ("Pakistan"), committee, Provisional/Confirmed badge, a countdown to pay, and a Registered → Allotted → Paid → Profile stepper. Then a pay section with UPI QR, bank details with copy buttons, a payment link, in-person instructions and a proof upload (screenshot, UTR, amount, date). Then the payment summary, position paper upload, your details, change or cancel, and a data privacy section.
> 6. **Live session voting on phone**, and a **chair console** for a projector (roll call with flags and A/P/PV toggles, a huge timer, speakers list, motions, voting results).
> 7. **Job Board** and a **staff login with two-factor**.
>
> **Organiser app:** a navy gradient left sidebar with a conference switcher and groups:
> - **Overview:** Dashboard
> - **Manage:** Applications, Delegates, Committees, Documents, Live sessions, Lists, Check-in
> - **Communicate:** Communications
> - **Money:** Finance overview, Financials, Payment proofs, Payments & refunds, Referrals, Expenses, Books
> - **Settings:** Conference page, Job Board, Settings, Import, Audit trail
>
> **Screens to design:**
> - **Dashboard:** status badge and Publish button, a set-up priorities checklist (x/7), share links with QR, an applicants-vs-target donut, a sources bar chart and a participants line chart.
> - **Applications:** tabs for each role plus Settings, a scoring select, and an "Accept & assign" seat picker modal.
> - **Delegates:** table plus a detail page.
> - **Committees:** cards with a portfolio seat grid and a single editor modal.
> - **Payment proofs:** review split view with the proof image and OCR match indicator, and Approve / Resubmit / Reject.
> - **Financials:** tabs Payments, Fee tiers, Payment rules.
> - **Finance overview:** stat tiles and charts.
> - **Expenses** and **Books:** journal, trial balance, P&L, GST.
> - **Check-in:** QR scanner with big green and red result cards.
> - **Communications:** compose to an audience over email, WhatsApp and SMS, with templates.
> - **Settings:** tabs Event rules, Organisation, Users & roles, Integrations, Google Sheets, Backups, Data protection.
>
> **Component and content rules:**
> - **Status badges:** green for paid/confirmed/approved, amber for pending/held/draft/unpaid, blue for submitted/processing/waitlisted/provisional, red for failed/rejected/cancelled/refunded.
> - **Formats:** show IDs like `TMUN27-R-000001` and codes in monospace. Money as `₹1,00,000`. Flags next to every country.
> - **Accessibility:** WCAG AA, 44px touch targets, visible blue focus rings.
> - **States:** empty states with a next action, skeleton loaders.
> - **Tables:** become stacked cards on phones.
> - **Buttons:** labels say exactly what they do.
