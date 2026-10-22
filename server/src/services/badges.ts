import crypto from 'node:crypto';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { all, one, update } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { getEvent, getOrg } from '../settings.ts';
import { bad, conflict, notFound, now } from '../util.ts';
import { enqueue, registerAttachment } from './notify.ts';
import { regVars } from './payments.ts';

const FONT = path.join(config.root, 'server', 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_B = path.join(config.root, 'server', 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
const mm = (v: number) => (v * 72) / 25.4;

/** Check-in code printed as a QR on the badge: the delegate ID plus a signature, so codes cannot be made up. */
export const checkinCode = (ref: string) => `DD1:${ref}:${crypto.createHmac('sha256', config.appSecret).update(`checkin:${ref}`).digest('base64url').slice(0, 12)}`;
export function parseCheckinCode(code: string) {
  const m = String(code ?? '').trim().match(/^DD1:([A-Z0-9-]+):([A-Za-z0-9_-]{12})$/);
  if (!m) return null;
  return checkinCode(m[1]) === m[0] ? m[1] : null;
}

function confirmedRows(eventId: string, o: { committeeId?: string; ids?: string[] }) {
  const w: string[] = ['r.event_id = ?', "s.state = 'confirmed'", 'r.cancelled_at IS NULL']; const p: any[] = [eventId];
  if (o.committeeId) { w.push('c.id = ?'); p.push(o.committeeId); }
  if (o.ids?.length) { w.push(`r.id IN (${o.ids.map(() => '?').join(',')})`); p.push(...o.ids); }
  return all(`SELECT r.*, c.name AS committee, c.short AS committee_short, p.name AS portfolio FROM registration r
    JOIN seat s ON s.registration_id = r.id JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id
    WHERE ${w.join(' AND ')} ORDER BY c.sort, p.sort, p.name`, ...p);
}

function render(build: (d: PDFKit.PDFDocument) => Promise<void>, layout: 'portrait' | 'landscape' = 'portrait'): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const d = new PDFDocument({ size: 'A4', layout, margin: 0, autoFirstPage: false });
    d.registerFont('R', FONT); d.registerFont('B', FONT_B);
    const chunks: Buffer[] = [];
    d.on('data', (c) => chunks.push(c)); d.on('end', () => resolve(Buffer.concat(chunks))); d.on('error', reject);
    try { await build(d); d.end(); } catch (e) { reject(e); }
  });
}

/** Name badges, eight per A4 sheet (cut along the light guides), each with a signed check-in QR. */
export async function badgesPdf(eventId: string, o: { committeeId?: string; ids?: string[] } = {}) {
  const ev = getEvent(eventId);
  const rows = confirmedRows(eventId, o);
  if (!rows.length) throw conflict('No confirmed delegates to print badges for');
  const W = mm(95), H = mm(65), MX = mm(10), MY = mm(13.5);
  const qrs = await Promise.all(rows.map((r) => QRCode.toBuffer(checkinCode(r.ref), { margin: 0, width: 220, errorCorrectionLevel: 'M' })));
  return render(async (d) => {
    rows.forEach((r, i) => {
      if (i % 8 === 0) d.addPage();
      const x = MX + (i % 2) * W, y = MY + Math.floor((i % 8) / 2) * H;
      d.save().rect(x, y, W, H).lineWidth(0.4).dash(2, { space: 3 }).strokeColor('#cccccc').stroke().restore();
      d.rect(x, y, W, mm(13)).fill('#1f3b63');
      d.font('B').fontSize(9).fillColor('#ffffff').text(ev.name.toUpperCase(), x + mm(5), y + mm(4.5), { width: W - mm(10), height: mm(5), ellipsis: true, lineBreak: false });
      // Shrink long names until they fit two lines beside the QR code.
      const nameW = W - mm(40);
      let size = 18;
      d.font('B');
      while (size > 10 && d.fontSize(size).heightOfString(r.full_name, { width: nameW }) > size * 2.6) size--;
      d.fontSize(size).fillColor('#111111').text(r.full_name, x + mm(5), y + mm(18), { width: nameW, height: mm(17), ellipsis: true });
      d.font('B').fontSize(11).fillColor('#1f3b63').text(r.portfolio, x + mm(5), y + mm(36), { width: W - mm(40), height: mm(10), ellipsis: true });
      d.font('R').fontSize(8.5).fillColor('#444444').text(r.committee, x + mm(5), y + mm(46), { width: W - mm(40), height: mm(8), ellipsis: true });
      d.font('R').fontSize(7.5).fillColor('#777777').text(r.institution, x + mm(5), y + mm(55), { width: W - mm(40), height: mm(5), ellipsis: true, lineBreak: false });
      d.image(qrs[i], x + W - mm(29), y + mm(19), { width: mm(24) });
      d.font('R').fontSize(6).fillColor('#777777').text(r.ref, x + W - mm(29), y + mm(45), { width: mm(24), align: 'center' });
    });
  });
}

/** Certificates of participation (or the award), one landscape page each. */
export async function certificatesPdf(eventId: string, o: { committeeId?: string; ids?: string[]; attendedOnly?: boolean } = {}) {
  const ev = getEvent(eventId); const org = getOrg(ev.org_id);
  let rows = confirmedRows(eventId, o);
  if (o.attendedOnly) rows = rows.filter((r) => r.attended_at);
  if (!rows.length) throw conflict('No delegates match for certificates');
  const dates = [ev.start_date, ev.end_date].filter(Boolean).map((d: string) => new Date(d + 'T00:00:00+05:30').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })).join(' – ');
  return render(async (d) => {
    for (const r of rows) {
      d.addPage();
      const W = d.page.width, H = d.page.height;
      d.rect(mm(10), mm(10), W - mm(20), H - mm(20)).lineWidth(2).strokeColor('#1f3b63').stroke();
      d.rect(mm(13), mm(13), W - mm(26), H - mm(26)).lineWidth(0.6).strokeColor('#9ec5f4').stroke();
      d.font('R').fontSize(12).fillColor('#555555').text(org.legal_name.toUpperCase(), 0, mm(30), { width: W, align: 'center', characterSpacing: 1.5 });
      d.font('B').fontSize(30).fillColor('#1f3b63').text(r.award ? `Certificate of ${r.award.includes('Mention') ? 'Recognition' : 'Merit'}` : 'Certificate of Participation', 0, mm(45), { width: W, align: 'center' });
      d.font('R').fontSize(13).fillColor('#333333').text('This certificate is presented to', 0, mm(68), { width: W, align: 'center' });
      d.font('B').fontSize(32).fillColor('#111111').text(r.full_name, mm(20), mm(78), { width: W - mm(40), align: 'center' });
      d.moveTo(W / 2 - mm(70), mm(95)).lineTo(W / 2 + mm(70), mm(95)).lineWidth(0.6).strokeColor('#bbbbbb').stroke();
      const line = r.award ? `for being awarded ${r.award} as ${r.portfolio} in the ${r.committee}` : `for representing ${r.portfolio} in the ${r.committee}`;
      d.font('R').fontSize(13).fillColor('#333333').text(`${line} at ${ev.name}${ev.venue ? `, ${ev.venue}` : ''}${dates ? `, ${dates}` : ''}.`, mm(35), mm(102), { width: W - mm(70), align: 'center', lineGap: 4 });
      for (const [i, label] of ['Secretary-General', 'Director-General'].entries()) {
        const x = i === 0 ? mm(45) : W - mm(115);
        d.moveTo(x, H - mm(40)).lineTo(x + mm(70), H - mm(40)).lineWidth(0.6).strokeColor('#555555').stroke();
        d.font('R').fontSize(10).fillColor('#555555').text(label, x, H - mm(37), { width: mm(70), align: 'center' });
      }
      d.font('R').fontSize(7).fillColor('#999999').text(`${r.ref} · verify at ${config.baseUrl}`, 0, H - mm(20), { width: W, align: 'center' });
    }
  }, 'landscape');
}

/** Scan a badge (or type a delegate ID) at the desk or committee door. */
export function checkIn(eventId: string, codeOrRef: string, scopeCommittees: string[] | null) {
  const input = String(codeOrRef ?? '').trim();
  if (!input) throw bad('Scan a badge or type a delegate ID');
  const ref = input.startsWith('DD1:') ? parseCheckinCode(input) : input.toUpperCase();
  if (!ref) throw bad('That QR code is not a valid badge for this system');
  const r = one(`SELECT r.*, c.id AS committee_id, c.name AS committee, p.name AS portfolio, s.state AS seat_state FROM registration r
    LEFT JOIN seat s ON s.registration_id = r.id LEFT JOIN portfolio p ON p.id = s.portfolio_id LEFT JOIN committee c ON c.id = p.committee_id
    WHERE r.ref = ? AND r.event_id = ?`, ref, eventId);
  if (!r) throw notFound('Delegate');
  if (scopeCommittees && !scopeCommittees.includes(r.committee_id)) throw bad(`${r.full_name} is in ${r.committee ?? 'another committee'}, not yours`);
  const who = { id: r.id, ref: r.ref, name: r.full_name, institution: r.institution, committee: r.committee, portfolio: r.portfolio };
  // Cancelled or unpaid delegates are not marked present; the desk sorts them out first.
  const hold = r.cancelled_at ? 'Registration is cancelled' : r.seat_state !== 'confirmed' ? 'Seat is not confirmed: send to the registration desk to pay' : null;
  if (hold) {
    audit('checkin.refused', 'registration', r.id, undefined, { reason: hold });
    return { ...who, admitted: false, reason: hold, alreadyCheckedIn: null, checkedInAt: null, warnings: [] as string[] };
  }
  const warnings: string[] = [];
  if (r.is_minor && r.guardian_consent !== 'verified') warnings.push('Parent/school consent not received: collect the signed form');
  const already = r.attended_at;
  if (!already) update('registration', r.id, { attended_at: now() });
  audit('checkin', 'registration', r.id, { attended_at: already }, { attended_at: already ?? now(), via: input.startsWith('DD1:') ? 'qr' : 'ref' });
  return { ...who, admitted: true, reason: null, alreadyCheckedIn: already, checkedInAt: already ?? now(), warnings };
}

/** Email certificates (PDF attached) to confirmed delegates, typically after the event. */
export function sendCertificates(eventId: string, attendedOnly: boolean) {
  const rows = confirmedRows(eventId, {}).filter((r) => !attendedOnly || r.attended_at);
  for (const r of rows) enqueue('certificate', { to: r.email, registrationId: r.id, vars: regVars(r), attachments: [{ kind: 'certificate', id: r.id }] });
  audit('certificates.send', 'event', eventId, undefined, { count: rows.length, attendedOnly });
  return rows.length;
}

registerAttachment('certificate', async (regId) => {
  const r = one('SELECT event_id, ref FROM registration WHERE id = ?', regId)!;
  return { filename: `certificate-${r.ref}.pdf`, content: await certificatesPdf(r.event_id, { ids: [regId] }) };
});
