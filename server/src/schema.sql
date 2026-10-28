-- DelegateDesk schema. Money is always INTEGER paise. Ids are UUIDs; "ref" columns are display references.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'private_limited',
  pan TEXT, gstin TEXT, state_code TEXT NOT NULL DEFAULT '29',
  address TEXT,
  upi_id TEXT, bank_name TEXT, bank_account TEXT, bank_ifsc TEXT,
  grievance_contact TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organization(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mun',
  venue TEXT, city TEXT, state_code TEXT,
  start_date TEXT, end_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',          -- draft | open | closed | held | cancelled
  settings TEXT NOT NULL DEFAULT '{}',          -- hold hours, gateways, GST, reminders, locks ...
  ref_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_tier (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  category TEXT NOT NULL,                      -- school | college | international | advisor
  name TEXT NOT NULL,                          -- Early bird / Regular / Late
  amount_paise INTEGER NOT NULL,               -- excluding GST
  starts_at TEXT, ends_at TEXT,
  quota INTEGER,                               -- null = unlimited
  used INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coupon (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  code TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- percent | flat
  value INTEGER NOT NULL,                      -- basis points or paise
  purpose TEXT NOT NULL DEFAULT 'coupon',      -- coupon | group | referral
  expires_at TEXT, max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(event_id, code)
);

CREATE TABLE IF NOT EXISTS committee (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL, short TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'single',         -- single | double
  description TEXT, guide_url TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_id, short)
);

CREATE TABLE IF NOT EXISTS portfolio (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL REFERENCES committee(id),
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard',       -- high | standard | low
  premium_paise INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE(committee_id, name)
);

-- One row per physical seat. registration_id UNIQUE => a registration holds at most one seat,
-- and the seat row itself can only ever point to one registration: double allotment is impossible.
CREATE TABLE IF NOT EXISTS seat (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolio(id),
  seat_no INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'open',          -- open | held | confirmed
  registration_id TEXT UNIQUE,
  held_at TEXT,
  UNIQUE(portfolio_id, seat_no),
  CHECK ((state = 'open' AND registration_id IS NULL) OR (state <> 'open' AND registration_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS delegation (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  institution TEXT NOT NULL,
  head_name TEXT NOT NULL, head_email TEXT NOT NULL, head_mobile TEXT,
  payment_mode TEXT NOT NULL DEFAULT 'members_pay', -- head_pays | members_pay
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrer (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organization(id),
  name TEXT NOT NULL,
  normalized TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL DEFAULT 'individual',     -- individual | ambassador | school | partner
  email TEXT, mobile TEXT, pan TEXT,
  bank_account TEXT, bank_ifsc TEXT, bank_name TEXT,
  plan_id TEXT,
  token TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registration (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES event(id),
  token TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL, email TEXT NOT NULL, mobile TEXT NOT NULL,
  institution TEXT NOT NULL, class_year TEXT NOT NULL, city TEXT NOT NULL,
  dob TEXT, is_minor INTEGER NOT NULL DEFAULT 0,
  guardian_name TEXT, guardian_email TEXT,
  guardian_consent TEXT NOT NULL DEFAULT 'not_required', -- not_required | pending | verified
  guardian_token TEXT,
  preferences TEXT NOT NULL DEFAULT '[]',      -- committee ids, [] = surprise me
  experience TEXT NOT NULL DEFAULT 'first',    -- first | some | experienced
  category TEXT NOT NULL DEFAULT 'school',
  referral_name TEXT,
  referrer_id TEXT REFERENCES referrer(id),
  referral_state TEXT NOT NULL DEFAULT 'none', -- none | linked | unmatched | no_referrer
  referral_suggestions TEXT,
  self_referral INTEGER NOT NULL DEFAULT 0,
  delegation_id TEXT REFERENCES delegation(id),
  -- fee snapshot (quoted fee is kept even if fee plans change later)
  fee_tier_id TEXT, coupon_id TEXT,
  base_paise INTEGER NOT NULL DEFAULT 0,
  premium_paise INTEGER NOT NULL DEFAULT 0,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL DEFAULT 0,        -- taxable value
  gst_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL DEFAULT 0,
  paid_paise INTEGER NOT NULL DEFAULT 0,       -- principal incl. GST confirmed
  refunded_paise INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 1,         -- for two-stage fee events
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending|processing|submitted|paid|failed|refund_requested|refunded|part_refunded|expired
  allot_status TEXT NOT NULL DEFAULT 'none',   -- none | held | confirmed | waitlisted | released
  waitlist_position INTEGER,
  hold_expires_at TEXT,
  confirmed_at TEXT,
  last_reminder_at TEXT, reminders_sent INTEGER NOT NULL DEFAULT 0,
  -- post-payment profile
  dietary TEXT, tshirt TEXT, emergency_name TEXT, emergency_phone TEXT,
  id_proof_path TEXT, id_proof_status TEXT NOT NULL DEFAULT 'missing',
  attended_at TEXT, award TEXT,
  email_bounced INTEGER NOT NULL DEFAULT 0,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT NOT NULL,
  consent_withdrawn_at TEXT,
  erased_at TEXT,
  cancelled_at TEXT,
  source TEXT NOT NULL DEFAULT 'form',         -- form | import | delegation
  import_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reg_event ON registration(event_id, payment_status);
CREATE INDEX IF NOT EXISTS ix_reg_email ON registration(event_id, email);
CREATE INDEX IF NOT EXISTS ix_reg_mobile ON registration(event_id, mobile);

CREATE TABLE IF NOT EXISTS allotment_history (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registration(id),
  seat_id TEXT,
  action TEXT NOT NULL,                        -- held | confirmed | released | swapped | manual | waitlisted | promoted
  by_user TEXT,                                -- null = system
  reason TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_order (
  id TEXT PRIMARY KEY,
  registration_id TEXT REFERENCES registration(id),
  delegation_id TEXT REFERENCES delegation(id),
  covers TEXT NOT NULL DEFAULT '[]',           -- registration ids covered (group payment)
  gateway TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  gateway_order_id TEXT UNIQUE,
  session TEXT,                                -- cashfree payment_session_id etc
  status TEXT NOT NULL DEFAULT 'created',      -- created | processing | paid | failed
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_transaction (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES payment_order(id),
  registration_id TEXT REFERENCES registration(id),
  gateway TEXT NOT NULL,                       -- razorpay | cashfree | mock | screenshot
  gateway_payment_id TEXT,
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL,                        -- captured | failed | authorized | approved | excess
  method TEXT,
  fee_paise INTEGER, fee_tax_paise INTEGER,
  verified_by TEXT NOT NULL DEFAULT 'webhook', -- webhook | api_fetch | cfo
  settlement_id TEXT,
  refunded_paise INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(gateway, gateway_payment_id)
);

CREATE TABLE IF NOT EXISTS webhook_event (
  id TEXT PRIMARY KEY,
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT,
  signature_valid INTEGER NOT NULL,
  raw_body TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  result TEXT,
  UNIQUE(gateway, event_id)
);

CREATE TABLE IF NOT EXISTS payment_evidence (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registration(id),
  file_path TEXT NOT NULL, file_hash TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  utr TEXT NOT NULL, amount_paise INTEGER NOT NULL, paid_on TEXT NOT NULL,
  ref_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',    -- submitted | approved | rejected | resubmit
  tamper_flags TEXT NOT NULL DEFAULT '[]',
  extracted TEXT,
  bank_line_id TEXT,
  approved_paise INTEGER,
  reviewer_id TEXT, reason TEXT, reviewed_at TEXT,
  escalated_at TEXT,
  submitted_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_evidence_utr ON payment_evidence(utr) WHERE status IN ('submitted','approved');
CREATE UNIQUE INDEX IF NOT EXISTS ux_evidence_hash ON payment_evidence(file_hash) WHERE status IN ('submitted','approved');

CREATE TABLE IF NOT EXISTS bank_line (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT,
  txn_date TEXT NOT NULL, description TEXT, utr TEXT,
  amount_paise INTEGER NOT NULL, direction TEXT NOT NULL DEFAULT 'cr',
  matched_evidence_id TEXT, matched_settlement_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settlement (
  id TEXT PRIMARY KEY,
  gateway TEXT NOT NULL,
  settlement_ref TEXT NOT NULL,
  gross_paise INTEGER NOT NULL, fee_paise INTEGER NOT NULL, tax_paise INTEGER NOT NULL, net_paise INTEGER NOT NULL,
  settled_on TEXT NOT NULL,
  payment_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',        -- draft | posted
  mismatch TEXT,
  bank_line_id TEXT,
  import_batch_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(gateway, settlement_ref)
);

CREATE TABLE IF NOT EXISTS refund (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registration(id),
  transaction_id TEXT,
  amount_paise INTEGER NOT NULL,
  reason TEXT NOT NULL,
  method TEXT NOT NULL,                        -- gateway | manual
  status TEXT NOT NULL DEFAULT 'requested',    -- requested | approved | processed | rejected | failed
  requested_by TEXT, approved_by TEXT, second_approved_by TEXT,
  bank_reference TEXT, gateway_refund_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL, processed_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,                          -- invoice | credit_note
  registration_id TEXT REFERENCES registration(id),
  source_id TEXT,
  taxable_paise INTEGER NOT NULL,
  cgst_paise INTEGER NOT NULL DEFAULT 0, sgst_paise INTEGER NOT NULL DEFAULT 0, igst_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  issued_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counter (key TEXT PRIMARY KEY, value INTEGER NOT NULL);

-- ---------- Books ----------
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                          -- asset | liability | equity | income | expense
  sys TEXT UNIQUE,                             -- system key used by posting templates
  schedule3 TEXT,                              -- Schedule III line
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS journal_entry (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  entry_date TEXT NOT NULL,
  event_id TEXT,                               -- cost centre
  narration TEXT NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT,
  reverses_id TEXT REFERENCES journal_entry(id),
  reversed_by_id TEXT REFERENCES journal_entry(id),
  posted_by TEXT,
  posted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_je_source ON journal_entry(source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_line (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES journal_entry(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  debit_paise INTEGER NOT NULL DEFAULT 0,
  credit_paise INTEGER NOT NULL DEFAULT 0,
  party_type TEXT, party_id TEXT,
  memo TEXT,
  CHECK (debit_paise >= 0 AND credit_paise >= 0 AND (debit_paise = 0 OR credit_paise = 0))
);
CREATE INDEX IF NOT EXISTS ix_jl_entry ON journal_line(entry_id);
CREATE INDEX IF NOT EXISTS ix_jl_account ON journal_line(account_id);

-- Posted journals are append-only: a correction is a reversing entry, never an edit.
CREATE TRIGGER IF NOT EXISTS tr_jl_no_update BEFORE UPDATE ON journal_line BEGIN SELECT RAISE(ABORT, 'journal lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS tr_jl_no_delete BEFORE DELETE ON journal_line BEGIN SELECT RAISE(ABORT, 'journal lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS tr_je_no_delete BEFORE DELETE ON journal_entry BEGIN SELECT RAISE(ABORT, 'journal entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS tr_je_update BEFORE UPDATE ON journal_entry
  WHEN NOT (OLD.reversed_by_id IS NULL AND NEW.reversed_by_id IS NOT NULL
            AND NEW.number = OLD.number AND NEW.entry_date = OLD.entry_date AND NEW.narration = OLD.narration
            AND NEW.source_type = OLD.source_type AND IFNULL(NEW.source_id,'') = IFNULL(OLD.source_id,'')
            AND IFNULL(NEW.event_id,'') = IFNULL(OLD.event_id,''))
  BEGIN SELECT RAISE(ABORT, 'journal entries are immutable; post a reversal'); END;

CREATE TABLE IF NOT EXISTS journal_request (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'manual',         -- manual | opening
  entry_date TEXT NOT NULL, event_id TEXT, narration TEXT NOT NULL,
  lines TEXT NOT NULL,
  total_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | posted | rejected
  requested_by TEXT NOT NULL, approvals TEXT NOT NULL DEFAULT '[]',
  entry_id TEXT, reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS period_lock (
  period TEXT PRIMARY KEY,                     -- YYYY-MM
  locked_by TEXT NOT NULL, locked_at TEXT NOT NULL
);

-- ---------- Expenses ----------
CREATE TABLE IF NOT EXISTS vendor (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, pan TEXT, gstin TEXT,
  bank_account TEXT, bank_ifsc TEXT, email TEXT, phone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  category TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  hard_limit INTEGER NOT NULL DEFAULT 0,
  UNIQUE(event_id, category)
);

CREATE TABLE IF NOT EXISTS expense (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES event(id),
  splits TEXT NOT NULL DEFAULT '[]',           -- [{event_id, pct}] when shared across events
  category TEXT NOT NULL,
  cost_behaviour TEXT NOT NULL DEFAULT 'fixed',-- fixed | variable | semi
  description TEXT NOT NULL,
  vendor_id TEXT REFERENCES vendor(id),
  invoice_no TEXT, bill_date TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,               -- taxable value
  gst_rate_bp INTEGER NOT NULL DEFAULT 0,
  gst_paise INTEGER NOT NULL DEFAULT 0,
  itc_eligible INTEGER NOT NULL DEFAULT 0,
  tds_section TEXT, tds_rate_bp INTEGER NOT NULL DEFAULT 0, tds_paise INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'bank',   -- bank | cash | upi | card | personal
  claimant_id TEXT,
  paid_paise INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | part_paid | paid
  status TEXT NOT NULL DEFAULT 'submitted',    -- draft | submitted | approved | rejected
  bill_path TEXT,
  submitted_by TEXT, approved_by TEXT, approved_at TEXT, reason TEXT,
  budget_override INTEGER NOT NULL DEFAULT 0,
  import_batch_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_payment (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expense(id),
  amount_paise INTEGER NOT NULL, mode TEXT NOT NULL, paid_on TEXT NOT NULL, reference TEXT,
  paid_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsorship (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  sponsor TEXT NOT NULL, amount_paise INTEGER NOT NULL, gst_paise INTEGER NOT NULL DEFAULT 0,
  received_on TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS petty_cash_count (
  id TEXT PRIMARY KEY, count_date TEXT NOT NULL, counted_paise INTEGER NOT NULL, book_paise INTEGER NOT NULL,
  counted_by TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
);

-- ---------- Commission ----------
CREATE TABLE IF NOT EXISTS commission_plan (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  method TEXT NOT NULL,                        -- flat_pct | flat_amount | slab | progressive
  basis TEXT NOT NULL DEFAULT 'count',         -- count | value
  base TEXT NOT NULL DEFAULT 'excl_gst',       -- excl_gst | after_discount | after_gateway_fee
  tiers TEXT NOT NULL DEFAULT '[]',            -- [{from,to,rate_bp,amount_paise}]
  period TEXT NOT NULL DEFAULT 'event',        -- event | month | year
  cap_paise INTEGER, min_payout_paise INTEGER NOT NULL DEFAULT 0,
  referrer_kind TEXT,                          -- default plan for this referrer type
  is_override INTEGER NOT NULL DEFAULT 0, signed_off_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commission_line (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES referrer(id),
  registration_id TEXT REFERENCES registration(id),
  event_id TEXT,
  period_key TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- accrual | trueup | reversal
  position INTEGER, bracket TEXT,
  base_paise INTEGER NOT NULL DEFAULT 0, rate_bp INTEGER,
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',         -- held | accrued | approved | paid
  hold_until TEXT,
  payout_id TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cl_ref ON commission_line(referrer_id, status);

CREATE TABLE IF NOT EXISTS payout (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  referrer_id TEXT NOT NULL REFERENCES referrer(id),
  gross_paise INTEGER NOT NULL, tds_paise INTEGER NOT NULL, net_paise INTEGER NOT NULL,
  tds_rate_bp INTEGER NOT NULL DEFAULT 0,
  fy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  reference TEXT, paid_on TEXT NOT NULL,
  created_by TEXT, created_at TEXT NOT NULL
);

-- ---------- Users & access ----------
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_role (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  role TEXT NOT NULL,     -- admin | cfo | accountant | registration_exec | chair | auditor | referrer | head_delegate | superadmin
  event_id TEXT, committee_id TEXT, referrer_id TEXT, delegation_id TEXT,
  UNIQUE(user_id, role, event_id, committee_id)
);

CREATE TABLE IF NOT EXISTS session (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  mfa_ok INTEGER NOT NULL DEFAULT 0,
  ip TEXT, ua TEXT,
  created_at TEXT NOT NULL, last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_log (
  id TEXT PRIMARY KEY, user_id TEXT, email TEXT, ip TEXT, ua TEXT, ok INTEGER NOT NULL, at TEXT NOT NULL
);

-- ---------- Messaging ----------
CREATE TABLE IF NOT EXISTS template (
  key TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT NOT NULL, body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
  PRIMARY KEY (key, channel)
);

-- Transactional outbox: rows are written in the same DB transaction as the state change they announce.
CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY,
  registration_id TEXT, recipient TEXT NOT NULL, recipient_kind TEXT NOT NULL DEFAULT 'delegate',
  channel TEXT NOT NULL DEFAULT 'email',
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL, body TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued',       -- queued | sent | failed | bounced | suppressed
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  respect_quiet_hours INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL, sent_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notif_q ON notification(status, scheduled_at);

-- ---------- Import / export / misc ----------
CREATE TABLE IF NOT EXISTS import_batch (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL, event_id TEXT, filename TEXT,
  mapping TEXT, total INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'committed',    -- committed | rolled_back
  created_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_job (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, format TEXT NOT NULL, filters TEXT, period TEXT,
  user_id TEXT, rows INTEGER, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS share_link (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, event_id TEXT NOT NULL, committee_id TEXT,
  include_minors INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, list TEXT NOT NULL, label TEXT NOT NULL,
  data TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_view (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, list TEXT NOT NULL, name TEXT NOT NULL,
  config TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS swap_request (
  id TEXT PRIMARY KEY, registration_id TEXT NOT NULL, to_committee_id TEXT NOT NULL, note TEXT,
  status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executive_board (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, committee_id TEXT, name TEXT NOT NULL, position TEXT NOT NULL,
  email TEXT, phone TEXT
);

CREATE TABLE IF NOT EXISTS erasure_request (
  id TEXT PRIMARY KEY, registration_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL, completed_at TEXT, completed_by TEXT, note TEXT
);

CREATE TABLE IF NOT EXISTS job_run (name TEXT PRIMARY KEY, last_run TEXT NOT NULL);

-- Audit trail (Companies (Accounts) Rules, Rule 3(1)): append-only, cannot be disabled.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  user_id TEXT, user_label TEXT, ip TEXT,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT,
  before TEXT, after TEXT
);
CREATE TRIGGER IF NOT EXISTS tr_audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS tr_audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

-- Optional mobile verification on the registration form.
CREATE TABLE IF NOT EXISTS otp_code (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, mobile TEXT NOT NULL,
  code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL, verified_at TEXT, used_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_otp_mobile ON otp_code(mobile, created_at);

-- Google Sheets live reporting for non-finance teams.
CREATE TABLE IF NOT EXISTS sheet_sync (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, list_kind TEXT NOT NULL, committee_id TEXT,
  spreadsheet_id TEXT NOT NULL, sheet_name TEXT NOT NULL,
  include_contacts INTEGER NOT NULL DEFAULT 0, include_minors INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 15, active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT, last_rows INTEGER, last_error TEXT,
  created_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_log (
  id TEXT PRIMARY KEY, file TEXT NOT NULL, size INTEGER NOT NULL, counts TEXT NOT NULL,
  created_at TEXT NOT NULL, verified_at TEXT, verify_result TEXT, created_by TEXT
);

-- Personal-data breach register (DPDP): what happened, who was affected, when the Board and people were told.
CREATE TABLE IF NOT EXISTS breach_incident (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, detected_at TEXT NOT NULL,
  data_affected TEXT, affected_count INTEGER, containment TEXT,
  status TEXT NOT NULL DEFAULT 'open',          -- open | contained | closed
  board_notified_at TEXT, people_notified_at TEXT, people_notified_count INTEGER,
  reported_by TEXT, created_at TEXT NOT NULL, closed_at TEXT
);

-- ---------- conference platform (Explore, Job Board, applications, position papers) ----------
-- Visits to the public conference page by source (instagram, whatsapp, direct ...), for "Where applicants come from".
CREATE TABLE IF NOT EXISTS page_view (
  event_id TEXT NOT NULL, day TEXT NOT NULL, channel TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, day, channel)
);

-- Roles posted on the Job Board: chairs, secretariat, staff, press, volunteers.
CREATE TABLE IF NOT EXISTS position (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  kind TEXT NOT NULL,                          -- chair | secretariat | staff | press | volunteer
  title TEXT NOT NULL,
  committee_id TEXT REFERENCES committee(id),
  description TEXT, openings INTEGER NOT NULL DEFAULT 1,
  deadline TEXT, open INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Applications from chairs/secretariat/staff (via a position) and from faculty advisors and observers.
CREATE TABLE IF NOT EXISTS role_application (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  position_id TEXT REFERENCES position(id),
  role TEXT NOT NULL,                          -- chair | secretariat | staff | press | volunteer | advisor | observer
  full_name TEXT NOT NULL, email TEXT NOT NULL, mobile TEXT, institution TEXT, city TEXT,
  experience TEXT, motivation TEXT, answers TEXT NOT NULL DEFAULT '{}', committee_prefs TEXT NOT NULL DEFAULT '[]',
  cv_path TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',   -- submitted | shortlisted | accepted | rejected | withdrawn
  score INTEGER, note TEXT,
  assigned_committee_id TEXT, assigned_title TEXT,
  token TEXT NOT NULL UNIQUE,
  channel TEXT,
  created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_roleapp_event ON role_application(event_id, role, status);

CREATE TABLE IF NOT EXISTS position_paper (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registration(id),
  committee_id TEXT REFERENCES committee(id),
  file_path TEXT NOT NULL, file_name TEXT, size INTEGER,
  status TEXT NOT NULL DEFAULT 'submitted',    -- submitted | reviewed | revise
  score INTEGER, feedback TEXT, reviewer_id TEXT,
  submitted_at TEXT NOT NULL, reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_paper_reg ON position_paper(registration_id);

-- One-time links for staff: invitations (set your password) and password resets.
CREATE TABLE IF NOT EXISTS user_token (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), kind TEXT NOT NULL,   -- invite | reset
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
