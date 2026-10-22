import { all, one } from '../db.ts';
import { fuzzyIncludes, json, bad } from '../util.ts';
import { statement } from './commission.ts';

export interface Col { key: string; label: string }
export interface ListDef { title: string; columns: Col[]; needsCommittee?: boolean; perm?: string; rows: (eventId: string, o: { committeeId?: string; committeeScope?: string[] | null }) => Record<string, any>[] }

const c = (key: string, label: string): Col => ({ key, label });

const BASE = `SELECT r.*, c.id AS committee_id, c.name AS committee, c.short AS committee_short, p.name AS portfolio, p.tier, s.seat_no, s.state AS seat_state,
  f.name AS referrer, d.institution AS delegation_institution
  FROM registration r
  LEFT JOIN seat s ON s.registration_id = r.id LEFT JOIN portfolio p ON p.id = s.portfolio_id LEFT JOIN committee c ON c.id = p.committee_id
  LEFT JOIN referrer f ON f.id = r.referrer_id LEFT JOIN delegation d ON d.id = r.delegation_id
  WHERE r.event_id = ? AND r.erased_at IS NULL`;

function scoped(rows: any[], scope?: string[] | null) {
  return scope ? rows.filter((r) => scope.includes(r.committee_id)) : rows;
}
const due = (r: any) => r.total_paise - r.paid_paise + r.refunded_paise;

export const LISTS: Record<string, ListDef> = {
  master: {
    title: 'Master delegate list',
    columns: [c('ref', 'ID'), c('full_name', 'Name'), c('institution', 'Institution'), c('city', 'City'), c('class_year', 'Class'), c('email', 'Email'), c('mobile', 'Mobile'), c('committee_short', 'Committee'), c('portfolio', 'Portfolio'), c('payment_status', 'Payment'), c('allot_status', 'Allotment'), c('referrer_label', 'Referrer'), c('total_paise', 'Fee'), c('balance_paise', 'Balance'), c('created_at', 'Registered')],
    rows: (e, o) => scoped(all(BASE + ' ORDER BY r.created_at DESC', e), o.committeeScope).map((r) => ({ ...r, balance_paise: due(r), referrer_label: r.referrer ?? (r.referral_name ? `${r.referral_name} (${r.referral_state})` : '') })),
  },
  details: {
    title: 'Delegate details sheet', perm: 'reg.read',
    columns: [c('ref', 'ID'), c('full_name', 'Name'), c('institution', 'Institution'), c('dob', 'Date of birth'), c('minor', 'Under 18'), c('guardian_consent', 'Guardian consent'), c('experience', 'Experience'), c('dietary', 'Dietary'), c('tshirt', 'T-shirt'), c('emergency_name', 'Emergency contact'), c('emergency_phone', 'Emergency phone'), c('id_proof_status', 'ID proof')],
    rows: (e, o) => scoped(all(BASE + " AND r.cancelled_at IS NULL ORDER BY r.full_name", e), o.committeeScope).map((r) => ({ ...r, minor: r.is_minor ? 'Yes' : 'No' })),
  },
  committee: {
    title: 'Committee list', needsCommittee: true,
    columns: [c('seat_label', 'Seat'), c('portfolio', 'Portfolio'), c('full_name', 'Delegate'), c('institution', 'Institution'), c('payment_status', 'Payment'), c('seat_state', 'State')],
    rows: (e, o) => all(`SELECT p.name AS portfolio, p.sort, s.seat_no, s.state AS seat_state, r.full_name, r.institution, r.payment_status, r.is_minor, c.id AS committee_id
        FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id LEFT JOIN registration r ON r.id = s.registration_id
        WHERE c.event_id = ? AND c.id = ? ORDER BY p.sort, p.name, s.seat_no`, e, o.committeeId).map((r) => ({ ...r, seat_label: `${r.portfolio}${r.seat_no > 1 ? ' #' + r.seat_no : ''}` })),
  },
  allotment: {
    title: 'Allotment list',
    columns: [c('ref', 'ID'), c('full_name', 'Delegate'), c('committee_short', 'Committee'), c('portfolio', 'Portfolio'), c('seat_state', 'State'), c('allotted_at', 'Allotted at'), c('allotted_by', 'Allotted by')],
    rows: (e, o) => scoped(all(`SELECT r.ref, r.full_name, c.id AS committee_id, c.short AS committee_short, p.name AS portfolio, s.state AS seat_state,
        (SELECT h.at FROM allotment_history h WHERE h.registration_id = r.id AND h.seat_id = s.id ORDER BY h.at DESC LIMIT 1) AS allotted_at,
        (SELECT COALESCE(u.name, 'System') FROM allotment_history h LEFT JOIN user u ON u.id = h.by_user WHERE h.registration_id = r.id AND h.seat_id = s.id ORDER BY h.at DESC LIMIT 1) AS allotted_by
      FROM seat s JOIN registration r ON r.id = s.registration_id JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id
      WHERE c.event_id = ? ORDER BY c.sort, p.sort`, e), o.committeeScope),
  },
  waitlist: {
    title: 'Waitlist',
    columns: [c('waitlist_position', 'Position'), c('ref', 'ID'), c('full_name', 'Name'), c('institution', 'Institution'), c('pref_names', 'Preferred committees'), c('created_at', 'Joined')],
    rows: (e) => {
      const names = new Map(all('SELECT id, short FROM committee WHERE event_id = ?', e).map((x) => [x.id, x.short]));
      return all("SELECT * FROM registration WHERE event_id = ? AND allot_status = 'waitlisted' AND cancelled_at IS NULL ORDER BY waitlist_position", e)
        .map((r) => ({ ...r, pref_names: json<string[]>(r.preferences, []).map((p) => names.get(p)).join(', ') || 'Surprise me' }));
    },
  },
  unpaid: {
    title: 'Unpaid and pending list', perm: 'payments.read',
    columns: [c('ref', 'ID'), c('full_name', 'Name'), c('mobile', 'Mobile'), c('committee_short', 'Committee'), c('payment_status', 'Status'), c('amount_due', 'Amount due'), c('hold_expires_at', 'Hold expires'), c('last_reminder_at', 'Last reminder'), c('reminders_sent', 'Reminders')],
    rows: (e) => all(BASE + " AND r.cancelled_at IS NULL AND r.payment_status IN ('pending','processing','submitted','failed') ORDER BY r.hold_expires_at", e).map((r) => ({ ...r, amount_due: due(r) })),
  },
  screenshots: {
    title: 'Screenshot review list', perm: 'payments.read',
    columns: [c('submitted_at', 'Submitted'), c('ref', 'ID'), c('full_name', 'Delegate'), c('utr', 'UTR'), c('amount_paise', 'Amount'), c('status', 'Status'), c('bank', 'Bank match'), c('reviewer', 'Reviewer'), c('reason', 'Reason')],
    rows: (e) => all(`SELECT pe.*, r.ref, r.full_name, u.name AS reviewer, CASE WHEN pe.bank_line_id IS NOT NULL THEN 'Matched' ELSE '' END AS bank
      FROM payment_evidence pe JOIN registration r ON r.id = pe.registration_id LEFT JOIN user u ON u.id = pe.reviewer_id WHERE r.event_id = ? ORDER BY pe.submitted_at DESC`, e),
  },
  delegations: {
    title: 'Delegation list',
    columns: [c('institution', 'Institution'), c('head_name', 'Head delegate'), c('head_email', 'Email'), c('members', 'Members'), c('paid', 'Paid'), c('payment_mode', 'Payment mode'), c('group_status', 'Group status')],
    rows: (e) => all(`SELECT d.*, COUNT(r.id) AS members, SUM(CASE WHEN r.payment_status = 'paid' THEN 1 ELSE 0 END) AS paid FROM delegation d
      LEFT JOIN registration r ON r.delegation_id = d.id AND r.cancelled_at IS NULL WHERE d.event_id = ? GROUP BY d.id ORDER BY d.institution`, e)
      .map((d) => ({ ...d, group_status: d.members && d.paid === d.members ? 'All paid' : d.paid ? 'Part paid' : 'Unpaid' })),
  },
  referrals: {
    title: 'Referral list', perm: 'commission.read',
    columns: [c('name', 'Referrer'), c('kind', 'Type'), c('referred', 'Delegates referred'), c('paid', 'Paid'), c('slab', 'Slab'), c('earned', 'Commission earned'), c('commission_due', 'Due (unpaid)'), c('paid_out', 'Paid out')],
    rows: (e) => all('SELECT DISTINCT f.* FROM referrer f JOIN registration r ON r.referrer_id = f.id WHERE r.event_id = ?', e).map((f) => {
      const st = statement(f.id);
      return { id: f.id, name: f.name, kind: f.kind, referred: st.referred, paid: st.paidCount, slab: st.currentSlab?.label ?? '—', earned: st.totals.earned, commission_due: st.totals.earned - st.totals.paid, paid_out: st.totals.paid };
    }),
  },
  attendance: {
    title: 'Attendance sheet', needsCommittee: true,
    columns: [c('portfolio', 'Portfolio'), c('full_name', 'Name'), c('institution', 'Institution'), c('signature', 'Signature'), c('attended_at', 'Check-in time')],
    rows: (e, o) => all(`SELECT r.id, p.name AS portfolio, r.full_name, r.institution, r.attended_at, '' AS signature, r.is_minor, c.id AS committee_id FROM seat s
      JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id JOIN registration r ON r.id = s.registration_id
      WHERE c.event_id = ? AND c.id = ? AND s.state = 'confirmed' ORDER BY p.sort, p.name`, e, o.committeeId),
  },
  badges: {
    title: 'Badge and certificate list',
    columns: [c('full_name', 'Name as printed'), c('institution', 'Institution'), c('committee', 'Committee'), c('portfolio', 'Portfolio'), c('award', 'Award')],
    rows: (e, o) => scoped(all(BASE + " AND r.payment_status IN ('paid','part_refunded') AND s.state = 'confirmed' ORDER BY c.sort, p.sort", e), o.committeeScope),
  },
  executive_board: {
    title: 'Executive board list',
    columns: [c('committee', 'Committee'), c('position', 'Position'), c('name', 'Name'), c('email', 'Email'), c('phone', 'Phone')],
    rows: (e, o) => scoped(all('SELECT b.*, c.name AS committee, b.committee_id FROM executive_board b LEFT JOIN committee c ON c.id = b.committee_id WHERE b.event_id = ? ORDER BY c.sort, b.position', e), o.committeeScope),
  },
  refunds: {
    title: 'Refund list', perm: 'refund.read',
    columns: [c('created_at', 'Requested'), c('ref', 'ID'), c('full_name', 'Delegate'), c('amount_paise', 'Amount'), c('reason', 'Reason'), c('method', 'Method'), c('approver', 'Approver'), c('status', 'Status'), c('reference', 'Reference')],
    rows: (e) => all(`SELECT f.*, r.ref, r.full_name, u.name AS approver, COALESCE(f.bank_reference, f.gateway_refund_id) AS reference FROM refund f
      JOIN registration r ON r.id = f.registration_id LEFT JOIN user u ON u.id = f.approved_by WHERE r.event_id = ? ORDER BY f.created_at DESC`, e),
  },
  unmatched_referrals: {
    title: 'Unmatched referrals', perm: 'reg.read',
    columns: [c('ref', 'ID'), c('full_name', 'Delegate'), c('referral_name', 'Typed referral name'), c('suggestion_names', 'Closest matches'), c('payment_status', 'Payment'), c('created_at', 'Registered')],
    rows: (e) => all("SELECT * FROM registration WHERE event_id = ? AND referral_state = 'unmatched' ORDER BY created_at", e)
      .map((r) => ({ ...r, suggestions: json(r.referral_suggestions, []), suggestion_names: json<any[]>(r.referral_suggestions, []).map((s) => `${s.name} (${Math.round(s.score * 100)}%)`).join(', ') })),
  },
};

export interface ListQuery { q?: string; filters?: Record<string, string>; committeeId?: string; sort?: string; dir?: 'asc' | 'desc' }

/** Search by name, email, phone, institution, UTR or portfolio with typo tolerance; filter by any column value. */
export function runList(kind: string, eventId: string, query: ListQuery, scope: string[] | null) {
  const def = LISTS[kind];
  if (!def) throw bad('Unknown list');
  if (def.needsCommittee && !query.committeeId) throw bad('Pick a committee');
  if (def.needsCommittee && scope && !scope.includes(query.committeeId!)) throw bad('You can only see your own committee');
  let rows = def.rows(eventId, { committeeId: query.committeeId, committeeScope: scope });
  for (const [k, v] of Object.entries(query.filters ?? {})) if (v) rows = rows.filter((r) => String(r[k] ?? '') === v);
  if (query.q?.trim()) {
    const fields = ['full_name', 'name', 'email', 'mobile', 'institution', 'utr', 'portfolio', 'ref', 'committee', 'referral_name', 'head_name', 'city'];
    rows = rows.filter((r) => fields.some((f) => r[f] != null && fuzzyIncludes(String(r[f]), query.q!)));
  }
  if (query.sort) {
    const s = query.sort; const m = query.dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => (a[s] ?? '') > (b[s] ?? '') ? m : (a[s] ?? '') < (b[s] ?? '') ? -m : 0);
  }
  return { title: def.title, columns: def.columns, rows };
}

export function committeeName(id?: string) { return id ? one('SELECT name FROM committee WHERE id = ?', id)?.name : undefined; }
