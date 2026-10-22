import { one, insert, update, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { orgSettings } from '../settings.ts';
import { bad, conflict, ctx, forbidden, inr, istDate, json, now, uid, notFound } from '../util.ts';
import { post, type Line } from './ledger.ts';

interface ReqLine { account_id: string; debit_paise?: number; credit_paise?: number; memo?: string }

function check(lines: ReqLine[]) {
  if (lines.length < 2) throw bad('A journal needs at least two lines');
  for (const l of lines) if (!one('SELECT 1 FROM account WHERE id = ?', l.account_id)) throw bad('Unknown account in journal');
  const dr = lines.reduce((s, l) => s + (l.debit_paise ?? 0), 0), cr = lines.reduce((s, l) => s + (l.credit_paise ?? 0), 0);
  if (dr !== cr || dr <= 0) throw bad(`Debits (${inr(dr)}) and credits (${inr(cr)}) must be equal and non-zero`);
  return dr;
}
const toLines = (lines: ReqLine[]): Line[] => lines.map((l) => ({ account: l.account_id, debit: l.debit_paise ?? 0, credit: l.credit_paise ?? 0, memo: l.memo }));

/**
 * Manual journal. The Accountant posts directly up to the CFO's limit; above it the entry waits for the CFO.
 * Opening balances always need both CFO and Accountant sign-off and are locked once posted.
 */
export function requestJournal(o: { kind?: 'manual' | 'opening'; date?: string; eventId?: string | null; narration: string; lines: ReqLine[] }) {
  if (!o.narration?.trim()) throw bad('Add a narration');
  const total = check(o.lines);
  const kind = o.kind ?? 'manual';
  const roles = ctx().roles ?? [];
  const limit = orgSettings().approvalLimits.accountantJournalPaise;
  const id = uid();
  insert('journal_request', { id, kind, entry_date: o.date ?? istDate(), event_id: o.eventId ?? null, narration: o.narration, lines: JSON.stringify(o.lines), total_paise: total, status: 'pending', requested_by: ctx().userId ?? 'system',
    // For opening balances the requester's own role counts as one of the two sign-offs.
    approvals: JSON.stringify(kind === 'opening' && ['cfo', 'accountant'].some((x) => roles.includes(x)) ? [{ user: ctx().userId, role: roles.includes('cfo') ? 'cfo' : 'accountant' }] : []), created_at: now() });
  audit('journal.request', 'journal_request', id, undefined, { kind, total, narration: o.narration });
  if (kind === 'manual' && roles.includes('accountant') && total <= limit) return approveJournal(id, true);
  return { id, status: 'pending', needs: kind === 'opening' ? 'CFO and Accountant sign-off' : 'CFO approval' };
}

export function approveJournal(id: string, auto = false) {
  return tx(() => {
    const r = one('SELECT * FROM journal_request WHERE id = ?', id);
    if (!r) throw notFound('Journal request');
    if (r.status !== 'pending') throw conflict(`Already ${r.status}`);
    const me = ctx().userId ?? 'system'; const roles = ctx().roles ?? [];
    const approvals = json<{ user: string; role: string }[]>(r.approvals, []);
    if (!auto) {
      if (r.kind === 'manual' && r.requested_by === me) throw forbidden('You raised this journal, so someone else must approve it');
      if (approvals.some((a) => a.user === me)) throw forbidden('You have already signed off');
      const role = roles.includes('cfo') ? 'cfo' : roles.includes('accountant') ? 'accountant' : null;
      if (!role) throw forbidden();
      if (r.kind === 'manual' && role !== 'cfo') throw forbidden('Only the CFO can approve journals above the limit');
      approvals.push({ user: me, role });
    }
    const ready = auto || (r.kind === 'manual' ? approvals.some((a) => a.role === 'cfo')
      : approvals.some((a) => a.role === 'cfo') && approvals.some((a) => a.role === 'accountant'));
    if (!ready) { update('journal_request', id, { approvals: JSON.stringify(approvals) }); audit('journal.signoff', 'journal_request', id, undefined, { approvals }); return { id, status: 'pending', approvals }; }
    const e = post({ date: r.entry_date, eventId: r.event_id, narration: r.narration, sourceType: r.kind === 'opening' ? 'opening' : 'manual', sourceId: id, lines: toLines(json(r.lines, [])) })!;
    update('journal_request', id, { status: 'posted', entry_id: e.id, approvals: JSON.stringify(approvals) });
    audit('journal.approve', 'journal_request', id, undefined, { entry: e.number });
    return { id, status: 'posted', entry: e };
  });
}

export function rejectJournal(id: string, reason: string) {
  const r = one('SELECT * FROM journal_request WHERE id = ?', id);
  if (!r || r.status !== 'pending') throw conflict('Not pending');
  if (!(ctx().roles ?? []).includes('cfo')) throw forbidden();
  update('journal_request', id, { status: 'rejected', reason });
  audit('journal.reject', 'journal_request', id, undefined, { reason });
}
