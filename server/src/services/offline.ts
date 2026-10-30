/**
 * The offline copy: one Excel workbook with everything the team needs if the site is unreachable on the day
 * (delegates and their seats, committees and portfolios, payments, applications), readable in Excel or Google Sheets.
 */
import ExcelJS from 'exceljs';
import { all } from '../db.ts';
import { getEvent } from '../settings.ts';

const rupees = (p: number | null | undefined) => (p == null ? null : Math.round(p) / 100);

export async function offlineCopy(eventId: string) {
  const ev = getEvent(eventId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DelegateDesk'; wb.created = new Date();
  const sheet = (name: string, cols: [string, string, number?][], rows: Record<string, any>[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(([key, header, width]) => ({ key, header, width: width ?? 18 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4FE0' } };
    for (const r of rows) ws.addRow(r);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };
  const about = wb.addWorksheet('About');
  about.columns = [{ width: 28 }, { width: 60 }];
  for (const r of [['Conference', ev.name], ['Code', ev.code], ['Dates', [ev.start_date, ev.end_date].filter(Boolean).join(' to ') || 'to be decided'], ['City', ev.city ?? ''], ['Exported', new Date().toLocaleString('en-IN')], ['Note', 'An offline copy for the conference team. It contains personal data: keep it private and delete it after the conference.']]) about.addRow(r);
  about.getColumn(1).font = { bold: true };

  sheet('Delegates', [['ref', 'Delegate ID', 16], ['full_name', 'Name', 24], ['email', 'Email', 28], ['mobile', 'Mobile', 15], ['institution', 'School / college', 28], ['class_year', 'Class', 10], ['city', 'City', 14],
    ['committee', 'Committee', 22], ['portfolio', 'Portfolio', 22], ['seat', 'Seat status', 12], ['payment_status', 'Payment', 12], ['total', 'Fee ₹', 10], ['paid', 'Paid ₹', 10], ['experience', 'MUNs attended', 12], ['award', 'Award', 18], ['checked_in', 'Checked in', 18], ['dietary', 'Dietary', 14], ['emergency', 'Emergency contact', 24]],
  all(`SELECT r.*, c.name AS committee, p.name AS portfolio FROM registration r LEFT JOIN seat s ON s.registration_id = r.id LEFT JOIN portfolio p ON p.id = s.portfolio_id LEFT JOIN committee c ON c.id = p.committee_id
    WHERE r.event_id = ? AND r.cancelled_at IS NULL AND r.erased_at IS NULL ORDER BY c.sort, p.sort, r.full_name`, eventId).map((r) => ({
    ...r, seat: r.allot_status, total: rupees(r.total_paise), paid: rupees(r.paid_paise - r.refunded_paise), experience: r.mun_count, checked_in: r.attended_at ? new Date(r.attended_at).toLocaleString('en-IN') : '',
    emergency: [r.emergency_name, r.emergency_phone].filter(Boolean).join(' '),
  })));

  sheet('Committees & seats', [['committee', 'Committee', 28], ['portfolio', 'Portfolio', 26], ['tier', 'Tier', 10], ['seat_no', 'Seat', 6], ['state', 'Status', 12], ['delegate', 'Delegate', 24], ['ref', 'Delegate ID', 16]],
    all(`SELECT c.name AS committee, p.name AS portfolio, p.tier, s.seat_no, s.state, r.full_name AS delegate, r.ref FROM committee c JOIN portfolio p ON p.committee_id = c.id JOIN seat s ON s.portfolio_id = p.id
      LEFT JOIN registration r ON r.id = s.registration_id WHERE c.event_id = ? ORDER BY c.sort, p.sort, s.seat_no`, eventId));

  sheet('Payments', [['date', 'Date', 20], ['ref', 'Delegate ID', 16], ['full_name', 'Delegate', 24], ['gateway', 'How', 14], ['method', 'Method', 12], ['amount', 'Amount ₹', 12], ['status', 'Status', 12], ['reference', 'Reference', 28]],
    all(`SELECT t.*, r.ref, r.full_name FROM payment_transaction t LEFT JOIN registration r ON r.id = t.registration_id WHERE r.event_id = ? ORDER BY t.created_at`, eventId)
      .map((t) => ({ ...t, date: new Date(t.created_at).toLocaleString('en-IN'), amount: rupees(t.amount_paise), reference: t.gateway_payment_id ?? '' })));

  sheet('Applications', [['date', 'Applied', 20], ['role', 'Role', 14], ['full_name', 'Name', 24], ['email', 'Email', 28], ['institution', 'Institution', 26], ['status', 'Status', 12], ['assigned_title', 'Assigned as', 22]],
    all('SELECT * FROM role_application WHERE event_id = ? ORDER BY created_at', eventId).map((a) => ({ ...a, date: new Date(a.created_at).toLocaleString('en-IN') })));

  return { name: `${ev.code}-offline-copy-${new Date().toISOString().slice(0, 10)}.xlsx`, file: Buffer.from(await wb.xlsx.writeBuffer()) };
}
