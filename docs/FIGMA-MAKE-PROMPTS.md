# Figma Make prompts for DelegateDesk

Paste **Prompt 1** first. Once Figma Make has built it, paste the follow-up prompts one at a time in the same chat. Short, focused prompts work better in Figma Make than one giant prompt.

---

## Prompt 1: design system, shells and the 4 most important screens

```
Build a responsive web app prototype called "DelegateDesk", a platform for running Model United Nations (MUN) conferences in India (money in ₹ with Indian grouping like ₹1,00,000; UPI payments; GST). Users are students aged 15–22, mostly on phones, and student organisers on laptops. The feel is a modern diplomatic summit: trustworthy, calm, official but friendly. There is one clear primary action per screen.

DESIGN SYSTEM (blue), defined as reusable variables/tokens:
- Colours, light mode:
  - page bg #F5F8FF; cards #FFFFFF; secondary surface #EEF3FC
  - borders #DCE4F2; text #0B1A33, secondary #42516B, hint #7A88A1
  - primary blue #1D4ED8 (hover #1238A8); deep navy #0A1F4D for sidebar and hero bands; sky accent #0EA5E9; soft blue highlight #E3ECFF
  - success #0E9F6E on #E3F8EF; warning #B7791F on #FDF3DC; danger #D92D20 on #FDECEA
- Dark mode, with a theme toggle: bg #060D1F, cards #0D1730, surface #13203F, borders #1F2E52, text #EAF0FF, primary #4F8BFF.
- Hero/banner gradient: 135deg #0A1F4D → #1D4ED8 → #3B82F6, a subtle dot-grid overlay and a thin #60A5FA underline.
- Type:
  - Playfair Display for page titles, conference names and hero text; Inter for all UI text; JetBrains Mono for IDs and codes.
  - Small uppercase blue "eyebrow" labels above titles.
- Shape: cards with 16px radius and a soft blue-tinted shadow; buttons with 12px radius; pill badges and chips; 4px spacing grid.
- Icons: Lucide.
- Status badges, always these colours:
  - green: Paid, Confirmed, Approved
  - amber: Pending, Held, Draft, Unpaid
  - blue: Submitted, Under review, Provisional, Waitlisted
  - red: Rejected, Cancelled, Refunded, Failed
- Accessibility: WCAG AA contrast, 44px touch targets, visible blue focus rings.

APP SHELLS:
A) Public site: a centred floating pill navbar with the logo "DelegateDesk" (blue square with a white "D"), links "Start Session", "List your Conference", "Explore", "Job Board" and a solid blue "Sign in" pill.
B) Organiser app:
  - A 248px navy gradient left sidebar (#0A1F4D→#0D2A66) with the logo and a conference switcher dropdown ("TMUN27 · Test Model United Nations").
  - Grouped nav with small uppercase group labels and Lucide icons:
    - OVERVIEW: Dashboard
    - MANAGE: Applications, Delegates, Committees, Documents, Live sessions, Lists, Check-in
    - COMMUNICATE: Communications
    - MONEY: Finance overview, Financials, Payment proofs, Payments & refunds, Referrals, Expenses, Books
    - SETTINGS: Conference page, Job Board, Settings, Import, Audit trail
  - The active item has a light-blue tint and a 3px bright-blue left bar.
  - The user's name and role, plus a theme toggle, sit at the bottom.
  - On mobile the sidebar becomes a drawer.

SCREENS (use realistic sample data: conference "Test Model United Nations" (TMUN), 19–21 Feb 2027, India Habitat Centre, New Delhi; committees UNSC · Security Council (15 seats), LS · Lok Sabha (30), IPC · International Press Corps (18); fees Early bird ₹1,600 until 31 Dec 2026, Regular ₹2,000):

1. EXPLORE (public home):
   - A hero on the blue gradient with the serif headline "Find your next Model UN", a search bar and a "List your conference" button.
   - Filter chips: In person / Online / Hybrid, Beginner / Intermediate / Advanced, city, month, Free.
   - A grid of conference cards: banner, overlapping round logo, short name, full name, dates, city with an Indian flag, "from ₹1,600", "48 seats open".

2. CONFERENCE PAGE (public):
   - A wide gradient banner with a thin light-blue underline, an overlapping round white logo, the small uppercase eyebrow "TEST MUN SOCIETY", a large serif "TMUN", the subtitle, and a meta row (calendar icon with dates, flag with venue, "In person", "High school & university").
   - Left column:
     - "About" card.
     - "Committees · 3 · 63 seats": rows with a coloured round icon, "UNSC · Security Council", level, "15 of 15 seats open", a one-line description, a seat fill bar and a "Study guide" button.
     - "Open positions": Director roles with Apply buttons.
     - "Fees" table.
   - Sticky right column:
     - Apply card: "Delegate fee from ₹1,600", a primary "Apply as a delegate →" button, secondary "Apply as a faculty advisor" and "Apply as an observer", and the link "Registering a whole school delegation?".
     - Share card: copy link, QR code, WhatsApp button.
     - Contact card.
   - On mobile, a sticky bottom "Apply" bar.

3. DELEGATE PAGE (private, design at 390px mobile width first):
   - A navy header band: eyebrow "YOUR DELEGATE PAGE", serif conference name, and "Aisha Delegate · Delegate ID TMUN27-R-000001" (ID in monospace).
   - Allotment card: a green pill "Registered — here is your allotment", "Security Council", a huge "Pakistan" with a Pakistan flag, a blue "Provisional" badge, the countdown "Pay within 47 h 59 min to keep this seat", and a 4-step progress stepper (Registered ✓, Allotted ✓, Paid, Profile).
   - "Pay ₹1,600" card with method tabs (UPI QR | Bank transfer | Payment link | In person):
     - UPI shows the ID "tmun@okaxis", the payee and a QR code.
     - Bank shows the account name, number and IFSC, each with a Copy button, and a remark "write TMUN27-R-000001 in the payment note".
     - Below: "Upload payment proof" with a dropzone, Transaction reference (UTR), Amount paid, Date paid and the primary button "Submit payment proof".
   - Payment summary: fee, discount, total, paid, balance due, an amber "Pending" badge and an "Allotment letter" download.
   - Position paper card: a "Due 10 Feb" badge and "Upload PDF".
   - "Your details" with an Edit button.
   - "Need a change?" with "Request a committee change" and a red-outlined "Cancel my registration".
   - "Your data" privacy note.

4. ORGANISER DASHBOARD (desktop, inside the sidebar shell):
   - Page head: serif "Test Model United Nations" with an amber "Draft" badge, the dates and city, a "View page ↗" link and a primary "Publish" button with a rocket icon.
   - An amber alert: "This conference is a draft: it isn't on Explore and the registration form is closed."
   - Two-column grid:
     - "Set-up priorities" card with a "3/7" badge and checklist rows (icon tile, bold title, one-line detail, chevron; done rows get a green check and strike-through). The rows: Add committees ✓, Add financial information ✓, Launch applications, Set up your conference page ✓, List chair positions, Check your emails, Share your conference link. Under them, two copy-boxes (conference page link and registration form link) and a QR code.
     - "Applicants against target": a blue donut "42 of 100" and rows Delegates / Faculty advisors / Observers / Chairs / Secretariat with counts.
     - "Where applicants come from": a horizontal bar chart (Instagram, WhatsApp, School, Direct).
     - A full-width "Participants over time" line chart.

Make all four screens work in light and dark mode, link them together (Explore card → Conference page → Apply → Delegate page; Sign in → Dashboard), and use smooth 150ms hover transitions.
```

---

## Follow-up prompts (paste one at a time)

### 2. Organiser onboarding wizard
```
Add a "List your conference" flow, reached from the navbar. First a sign-up card (name, email, password with "10+ characters", organisation name). Then a full-screen 10-step wizard: one question per screen, progress dots at the top, and Back / Continue buttons at the bottom. Options are big tappable cards with a large icon tile; the selected card gets a blue ring and a check.
Steps:
1. Conference name, short name (auto-suggested) and dates.
2. Format: In person / Online / Hybrid.
3. Level (Beginner / Intermediate / Advanced) and audience (School / University / Both).
4. Venue, city, country with a flag.
5. Expected delegates (slider, default 100).
6. Committees: type a committee name like "UNSC" and its member countries auto-fill as removable flag chips, with "+ Add portfolio" and "+ Add committee".
7. About: description, logo upload, banner upload.
8. Payments:
   - Free vs Paid; the regular fee; an early-bird fee with an end date; GST on/off.
   - Then multi-select payment method cards (Payment link, UPI QR code, Bank transfer, In-person payment), with one sub-step per chosen method.
9. "What do you need help with?": 6 colourful cards (Applications & Allocations, Payments, Running Committees, Emails, Recruiting Chairs, Marketing) plus "Select all".
10. Review summary and "Create conference".
Finish with a success screen showing the public link and registration link with copy buttons and a QR code.
```

### 3. Delegate registration form (mobile)
```
Add the public delegate registration form at 390px width, single column, with the conference name and dates in a navy header.
Fields, each with a visible label:
- Full name; Email; Mobile (WhatsApp) with a +91 prefix and an optional 6-digit verification code.
- School or college (autocomplete); Class or year (select); City; Date of birth.
- When under 18: Parent/guardian name and email.
- Committee preference as tappable chips that show rank numbers 1, 2, 3 in the order tapped.
- Why do you want to attend? (textarea); How did you hear about us? (select); Referred by.
- A collapsed "Have a coupon code?" field.
- An "I agree to the terms" checkbox.
A live price line ("Registration fee ₹1,600 · Coupon −₹160 · Total ₹1,440") sits above a full-width primary "Register" button. Show the inline error style on one field.
```

### 4. Applications and seat assignment
```
Add the organiser "Applications" page.
- Underline tabs: Delegates · Faculty advisors · Observers · Chairs · Press · Settings.
- Table columns: name with school underneath, committee preferences as small chips, applied date, a "Score" select (1–10), a status badge, and actions "Accept & assign" (primary), "Waitlist" and "Reject".
- "Accept & assign" opens a modal: pick a committee, then a radio list of open portfolios with flags (Pakistan, France, Japan…), then an "Assign" button.
- Settings tab: switches for who can apply, an application deadline date, a segmented control "Instantly, by preference" | "After we review applications", and a position papers switch with a due date.
On mobile the table becomes stacked cards.
```

### 5. Delegates list and delegate detail
```
Add "Delegates":
- A searchable, filterable table: Delegate ID in monospace, name, school, committee · portfolio with a flag, payment status badge, paid/due in ₹, source, date. It has bulk select and "Export CSV".
- Clicking a row opens a detail page:
  - Header: name, ID, status badges.
  - Cards: Profile; Allotment, with a "Move to another seat" button; Payment ledger (date, method, amount, status); Documents; Messages; a timeline of every change.
  - Actions: Record payment, Refund…, Resend link, Cancel (danger).
```

### 6. Committees and portfolios
```
Add "Committees":
- One card per committee, showing name, level, "12 / 15 seats filled", a fill bar and an Edit button.
- Below each card, a grid of portfolio chips with flags, coloured by state: open (outline), held (amber), taken (blue), confirmed (green), with a legend.
- "+ Add committee" and Edit both open the same editor modal: name, short name, "About this committee" textarea, level, and editable portfolio chips with auto-fill from the committee name.
```

### 7. Payments: proofs, financials, refunds
```
Add the money screens:
1. "Payment proofs" review queue as a split view:
   - Left: a list of pending proofs.
   - Centre: a large zoomable receipt image.
   - Right: delegate, expected ₹1,600, the reference read from the image, the amount read from the image, a green "Amounts match" indicator, and buttons Approve (green), Ask to resubmit, Reject (red).
2. "Financials" with tabs Payments · Fee tiers · Payment rules:
   - Payments: summary cards of the chosen methods with "Change set-up", plus a "Record an in-person payment" form (Delegate ID, amount, note).
   - Fee tiers: a tiers table and a coupons table with "+ Coupon".
   - Payment rules: a form (refund window days, large refund threshold, group discount).
3. "Payments & refunds": tabs Refunds · Transactions · Settlements. Refund rows show requested-by, approved-by, amount and status, with Approve / Reject / Mark paid.
4. "Finance overview": stat tiles (Collected ₹2,40,000, Pending, Refunds, Expenses, Net, GST payable), a break-even meter, a collections line chart and budget-vs-actual bars.
```

### 8. Chair console and live session
```
Add the live committee session.
1. Chair console for a 1440px projector screen:
   - Top card: eyebrow "MODERATED CAUCUS", serif "UNSC · Security Council", an agenda input, a huge letter-spaced join code "P69T8X" with "Copy link", and a red "End" button.
   - Three columns:
     - Left, "Roll call": a "15/15 · quorum" badge, then rows of flag + country (★ for veto holders) with an A / P / PV segmented toggle.
     - Centre: a giant timer "10:00" with Pause, Reset and Next speaker; then the speakers list and a log.
     - Right: Motions (type, minutes, speaking time, "Add motion"); Voting ("Open vote" and a result card "15 for · 0 against · 0 abstain — Passes").
2. Delegate phone view: the committee name, the current mode, a big timer, the current speaker and an "Ask to speak" button. When a vote opens, show full-screen For (green) / Against (red) / Abstain (grey) buttons.
```

### 9. Check-in, communications, settings, login
```
Add:
1. "Check-in": a big camera QR scanner frame with manual search, and a result card. Show both states: a large green "✓ Checked in — Aisha Delegate · UNSC · Pakistan" and a large red "Not paid". Add a live counter "142 / 180 checked in".
2. "Communications": tabs Compose · Templates · History. Compose has an audience picker (Everyone, a committee, Unpaid, Confirmed), channel toggles (Email, WhatsApp, SMS) and merge-field chips {name} {portfolio}. History shows delivery badges.
3. "Settings": tabs Event rules · Organisation · Users & roles · Integrations · Google Sheets · Backups · Data protection.
   - Users & roles: an "+ Invite staff" button and a users table.
   - Integrations: connection cards with Connected / Not connected states.
   - Backups: "Back up now" and a list with "Restore test passed" badges.
4. Staff login: a centred card over the blue gradient band, then a two-factor set-up screen (QR code + secret + 6-digit code boxes that auto-advance).
```

### 10. Polish pass
```
Polish the whole prototype:
- Consistent spacing on the 4px grid.
- Skeleton loaders shaped like the real content.
- An empty state for every list (icon, title, one line, one action button).
- Toasts at the bottom-right.
- Every screen correct at 390px, 768px and 1440px.
- Dark mode checked on every screen.
- All buttons say exactly what they do.
```
