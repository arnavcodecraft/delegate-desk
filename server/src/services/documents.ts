import path from 'node:path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { all, one, insert } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { getOrg, eventSettings } from '../settings.ts';
import { ctx, inr, now, uid, notFound } from '../util.ts';
import { seatOf } from './allocation.ts';
import { registerAttachment } from './notify.ts';
import { statement } from './commission.ts';

const FONT = path.join(config.root, 'server', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_B = path.join(config.root, 'server', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

function doc(opts: { layout?: 'portrait' | 'landscape' } = {}) {
  const d = new PDFDocument({ size: 'A4', margin: 40, layout: opts.layout ?? 'portrait', bufferPages: true });
  d.registerFont('R', FONT); d.registerFont('B', FONT_B); d.font('R');
  return d;
}
function finish(d: PDFKit.PDFDocument, footer?: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    d.on('data', (c) => chunks.push(c));
    d.on('end', () => resolve(Buffer.concat(chunks)));
    const range = d.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      d.switchToPage(i);
      const bottom = d.page.height - 30;
      d.font('R').fontSize(7).fillColor('#666').text(`${footer ?? ''}   Page ${i + 1} of ${range.count}`, 40, bottom, { width: d.page.width - 80, align: 'right', lineBreak: false });
    }
    d.end();
  });
}

/** Print-ready table: event name, generation time, filters and user in the header; page numbers in the footer. */
export async function tablePdf(title: string, columns: { key: string; label: string }[], rows: Record<string, any>[], meta: { event?: string; filters?: string }) {
  const landscape = columns.length > 6;
  const d = doc({ layout: landscape ? 'landscape' : 'portrait' });
  const W = d.page.width - 80;
  const header = () => {
    d.font('B').fontSize(13).fillColor('#111').text(title, 40, 40);
    d.font('R').fontSize(8).fillColor('#555').text(`${meta.event ?? ''}  ·  Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} by ${ctx().userLabel ?? 'system'}${meta.filters ? '  ·  Filters: ' + meta.filters : ''}`);
    d.moveDown(0.6);
  };
  header();
  const colW = W / columns.length;
  const drawRow = (vals: string[], bold = false) => {
    const y = d.y;
    const heights = vals.map((v) => d.font(bold ? 'B' : 'R').fontSize(8).heightOfString(v, { width: colW - 6 }));
    const h = Math.max(14, ...heights) + 4;
    if (y + h > d.page.height - 50) { d.addPage(); header(); return drawRow(vals, bold); }
    if (bold) d.rect(40, y - 2, W, h).fill('#f1f1ee');
    vals.forEach((v, i) => d.font(bold ? 'B' : 'R').fontSize(8).fillColor('#111').text(v, 40 + i * colW + 3, y + 1, { width: colW - 6 }));
    d.moveTo(40, y + h - 2).lineTo(40 + W, y + h - 2).strokeColor('#ddd').lineWidth(0.5).stroke();
    d.y = y + h;
  };
  drawRow(columns.map((c) => c.label), true);
  for (const r of rows) drawRow(columns.map((c) => fmtCell(r[c.key], c.key)));
  if (!rows.length) d.font('R').fontSize(9).fillColor('#666').text('No rows.');
  return finish(d, meta.event);
}

function fmtCell(v: any, key: string) {
  if (v == null) return '';
  if (typeof v === 'number' && /paise|amount|_due|total|balance|commission|revenue|fees/.test(key)) return inr(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  return String(v);
}

function orgHeader(d: PDFKit.PDFDocument, title: string) {
  const org = getOrg();
  d.font('B').fontSize(15).fillColor('#111').text(org.legal_name);
  d.font('R').fontSize(8).fillColor('#444').text([org.address, org.gstin ? `GSTIN ${org.gstin}` : null, org.pan ? `PAN ${org.pan}` : null].filter(Boolean).join('  ·  '));
  d.moveDown(0.8);
  d.font('B').fontSize(12).fillColor('#111').text(title);
  d.moveDown(0.4);
  return org;
}
const kv = (d: PDFKit.PDFDocument, k: string, v: string) => { d.font('B').fontSize(9).text(k + ': ', { continued: true }).font('R').text(v); };

export async function invoicePdf(invoiceId: string) {
  const inv = one('SELECT * FROM invoice WHERE id = ?', invoiceId);
  if (!inv) throw notFound('Invoice');
  const reg = one('SELECT r.*, e.name AS event_name, e.state_code AS event_state FROM registration r JOIN event e ON e.id = r.event_id WHERE r.id = ?', inv.registration_id)!;
  const d = doc();
  orgHeader(d, inv.kind === 'credit_note' ? 'Credit note' : 'Tax invoice / payment receipt');
  kv(d, inv.kind === 'credit_note' ? 'Credit note no.' : 'Invoice no.', inv.number);
  kv(d, 'Date', new Date(inv.issued_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' }));
  kv(d, 'Billed to', `${reg.full_name}, ${reg.institution}, ${reg.city}`);
  kv(d, 'Registration', `${reg.ref} – ${reg.event_name}`);
  kv(d, 'Place of supply', `State code ${reg.event_state ?? getOrg().state_code}`);
  d.moveDown();
  const s = eventSettings(reg.event_id);
  const rows: [string, string][] = [
    [`Delegate registration fee (SAC ${s.sacCode})`, inr(inv.taxable_paise)],
    ...(inv.cgst_paise ? [[`CGST @ ${s.gstRateBp / 200}%`, inr(inv.cgst_paise)] as [string, string], [`SGST @ ${s.gstRateBp / 200}%`, inr(inv.sgst_paise)] as [string, string]] : []),
    ...(inv.igst_paise ? [[`IGST @ ${s.gstRateBp / 100}%`, inr(inv.igst_paise)] as [string, string]] : []),
  ];
  for (const [k, v] of rows) { const y = d.y; d.font('R').fontSize(10).text(k, 40, y); d.text(v, 400, y, { width: 155, align: 'right' }); d.moveDown(0.3); }
  d.moveTo(40, d.y + 2).lineTo(555, d.y + 2).strokeColor('#999').stroke(); d.moveDown(0.5);
  const y = d.y; d.font('B').fontSize(11).text(inv.kind === 'credit_note' ? 'Total credited' : 'Total received', 40, y); d.text(inr(inv.total_paise), 400, y, { width: 155, align: 'right' });
  d.moveDown(2);
  d.font('R').fontSize(8).fillColor('#555').text('This is a computer-generated document and needs no signature. GST treatment is configured by the organiser and confirmed by its chartered accountant.');
  return { filename: `${inv.number.replace(/\//g, '-')}.pdf`, content: await finish(d, inv.number) };
}

export async function allotmentLetterPdf(regId: string) {
  const reg = one('SELECT r.*, e.name AS event_name, e.venue, e.start_date, e.end_date FROM registration r JOIN event e ON e.id = r.event_id WHERE r.id = ?', regId);
  if (!reg) throw notFound('Registration');
  const seat = seatOf(regId);
  const d = doc();
  orgHeader(d, `Allotment letter – ${reg.event_name}`);
  d.font('R').fontSize(10).text(`Dear ${reg.full_name},`); d.moveDown(0.5);
  d.text(seat ? `We are pleased to confirm your allotment for ${reg.event_name}${reg.venue ? ' at ' + reg.venue : ''}${reg.start_date ? `, ${reg.start_date} to ${reg.end_date}` : ''}.` : 'Your allotment is pending.');
  d.moveDown();
  kv(d, 'Delegate ID', reg.ref); kv(d, 'Institution', reg.institution);
  if (seat) { kv(d, 'Committee', seat.committee); kv(d, 'Portfolio', seat.portfolio); kv(d, 'Status', seat.state === 'confirmed' ? 'Confirmed' : 'Provisional – pay to confirm'); }
  d.moveDown(); d.text('Please carry a photo ID to registration. We look forward to seeing you.'); d.moveDown(); d.text('Secretariat');
  return { filename: `allotment-${reg.ref}.pdf`, content: await finish(d, reg.ref) };
}

export async function commissionStatementPdf(payoutIdOrReferrer: string) {
  const payout = one('SELECT * FROM payout WHERE id = ?', payoutIdOrReferrer);
  const referrerId = payout?.referrer_id ?? payoutIdOrReferrer;
  const st = statement(referrerId);
  const d = doc();
  orgHeader(d, `Commission statement – ${st.referrer.name}`);
  kv(d, 'Plan', st.plan ? `${st.plan.name} (${st.plan.method}, by ${st.plan.basis})` : 'No plan');
  kv(d, 'Paid registrations', String(st.paidCount));
  if (st.currentSlab) kv(d, 'Current slab', st.currentSlab.label);
  if (payout) { kv(d, 'Payout', `${payout.ref} on ${payout.paid_on}`); kv(d, 'Gross', inr(payout.gross_paise)); kv(d, 'TDS', inr(payout.tds_paise)); kv(d, 'Net paid', inr(payout.net_paise)); kv(d, 'Reference', payout.reference ?? ''); }
  d.moveDown();
  const lines = payout ? st.lines.filter((l: any) => l.payout_id === payout.id) : st.lines;
  d.font('B').fontSize(9).text('Registration                Type        Bracket           Base            Amount');
  for (const l of lines) d.font('R').fontSize(8).text(`${(l.ref ?? '').padEnd(18)} ${(l.full_name ?? '').slice(0, 18).padEnd(20)} ${l.kind.padEnd(10)} ${String(l.bracket ?? '').padEnd(16)} ${inr(l.base_paise).padStart(12)} ${inr(l.amount_paise).padStart(12)}`);
  return { filename: `commission-${payout?.ref?.replace(/\//g, '-') ?? st.referrer.name}.pdf`, content: await finish(d, st.referrer.name) };
}

export async function statementPdf(title: string, sections: { heading: string; rows: [string, number][]; total?: [string, number] }[], meta: { event?: string; period?: string }) {
  const d = doc();
  orgHeader(d, title);
  d.font('R').fontSize(8).fillColor('#555').text(`${meta.event ?? 'All events'}  ·  ${meta.period ?? ''}  ·  Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`).fillColor('#111');
  for (const s of sections) {
    d.moveDown(0.8); d.font('B').fontSize(10).text(s.heading);
    for (const [k, v] of s.rows) { const y = d.y; d.font('R').fontSize(9).text(k, 50, y, { width: 360 }); d.text(inr(v), 400, y, { width: 155, align: 'right' }); }
    if (s.total) { const y = d.y + 2; d.font('B').fontSize(9).text(s.total[0], 50, y); d.text(inr(s.total[1]), 400, y, { width: 155, align: 'right' }); }
  }
  return finish(d, meta.event);
}

// ---------- spreadsheet / csv / tally ----------
export function toCsv(columns: { key: string; label: string }[], rows: Record<string, any>[], meta?: Record<string, string>) {
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
  const lines = meta ? Object.entries(meta).map(([k, v]) => `# ${k}: ${v}`) : [];
  lines.push(columns.map((c) => esc(c.label)).join(','));
  for (const r of rows) lines.push(columns.map((c) => esc(moneyCol(c.key) && typeof r[c.key] === 'number' ? (r[c.key] / 100).toFixed(2) : r[c.key])).join(','));
  return '﻿' + lines.join('\r\n');
}
const moneyCol = (k: string) => /paise|amount|_due|total|balance|commission|revenue|fees|debit|credit/.test(k);

export async function toXlsx(sheet: string, columns: { key: string; label: string }[], rows: Record<string, any>[], meta: Record<string, string>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DelegateDesk'; wb.created = new Date();
  const ws = wb.addWorksheet(sheet.slice(0, 30));
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(10, c.label.length + 4)) }));
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, moneyCol(c.key) && typeof r[c.key] === 'number' ? r[c.key] / 100 : r[c.key]])));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  columns.forEach((c, i) => { if (moneyCol(c.key)) ws.getColumn(i + 1).numFmt = '#,##,##0.00'; });
  const about = wb.addWorksheet('About this export');
  for (const [k, v] of Object.entries(meta)) about.addRow([k, v]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Tally-compatible XML vouchers (Journal) so the company's CA can import into Tally. */
export function tallyXml(entries: any[]) {
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const vouchers = entries.map((e) => `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Journal" ACTION="Create">
      <DATE>${e.entry_date.replace(/-/g, '')}</DATE>
      <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(e.number)}</VOUCHERNUMBER>
      <NARRATION>${esc(e.narration)}</NARRATION>${e.lines.map((l: any) => `
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${esc(l.name)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${l.debit_paise > 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
       <AMOUNT>${l.debit_paise > 0 ? '-' : ''}${((l.debit_paise || l.credit_paise) / 100).toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`).join('')}
     </VOUCHER>
    </TALLYMESSAGE>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>${vouchers}
 </REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>`;
}

/** Every export is logged with who generated it, the filters and the period. */
export function logExport(kind: string, format: string, rows: number, filters?: unknown, period?: string) {
  insert('export_job', { id: uid(), kind, format, filters: filters ? JSON.stringify(filters) : null, period: period ?? null, user_id: ctx().userId ?? null, rows, created_at: now() });
  audit('export', kind, null, undefined, { format, rows, filters, period });
}

export function exportMeta(o: { event?: string; filters?: unknown; period?: string; list: string }) {
  return { Export: o.list, Event: o.event ?? 'All events', Filters: o.filters ? JSON.stringify(o.filters) : 'none', Period: o.period ?? 'all', Generated: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), 'Generated by': ctx().userLabel ?? 'system' };
}

registerAttachment('invoice', invoicePdf);
registerAttachment('commission_statement', commissionStatementPdf);
registerAttachment('allotment', allotmentLetterPdf);
export { all };
