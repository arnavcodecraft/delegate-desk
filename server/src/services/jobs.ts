import { all, one, run } from '../db.ts';
import { eventSettings } from '../settings.ts';
import { addHours, asSystem, now } from '../util.ts';
import { releaseSeat } from './allocation.ts';
import { enqueue, deliverPending, notifyStaff } from './notify.ts';
import { regVars, resolveOrder, promoteWaitlistAndNotify, unsettledPayments } from './payments.ts';
import { escalateStale } from './evidence.ts';
import { releaseHolds } from './commission.ts';
import { audit } from '../audit.ts';
import { syncDue } from './sheets.ts';
import { dailyBackup } from './backup.ts';

/** Unpaid holds return to the pool; a proof under review keeps the seat up to the grace limit. */
export function expireHolds() {
  const due = all("SELECT * FROM registration WHERE allot_status = 'held' AND hold_expires_at < ? AND paid_paise = 0 AND cancelled_at IS NULL", now());
  const events = new Set<string>();
  let n = 0;
  for (const r of due) {
    const s = eventSettings(r.event_id);
    if (r.payment_status === 'submitted' && addHours(r.hold_expires_at, s.holdGraceHours) > now()) continue;
    if (r.payment_status === 'processing' && addHours(r.hold_expires_at, 1) > now()) continue;
    releaseSeat(r.id, 'Hold expired unpaid');
    run("UPDATE registration SET payment_status = 'expired', updated_at = ? WHERE id = ?", now(), r.id);
    enqueue('seat_released', { to: r.email, registrationId: r.id, vars: regVars(r) });
    audit('hold.expire', 'registration', r.id);
    events.add(r.event_id); n++;
  }
  for (const e of events) promoteWaitlistAndNotify(e);
  return n;
}

export function holdWarnings() {
  const regs = all("SELECT * FROM registration WHERE allot_status = 'held' AND paid_paise = 0 AND cancelled_at IS NULL AND payment_status IN ('pending','failed') AND hold_expires_at > ?", now());
  let n = 0;
  for (const r of regs) {
    if (addHours(now(), eventSettings(r.event_id).holdWarningHours) < r.hold_expires_at) continue;
    if (one("SELECT 1 FROM notification WHERE registration_id = ? AND template_key = 'hold_expiring'", r.id)) continue;
    enqueue('hold_expiring', { to: r.email, registrationId: r.id, vars: regVars(r) });
    n++;
  }
  return n;
}

/** Payment pending after 24 hours, 72 hours and 7 days (configurable), respecting quiet hours and unsubscribes. */
export function paymentReminders() {
  const regs = all("SELECT * FROM registration WHERE cancelled_at IS NULL AND allot_status = 'held' AND payment_status IN ('pending','failed') AND total_paise - paid_paise + refunded_paise > 0");
  let n = 0;
  for (const r of regs) {
    const hours = eventSettings(r.event_id).reminderHours;
    const next = hours[r.reminders_sent];
    if (next == null || addHours(r.created_at, next) > now()) continue;
    enqueue('payment_reminder', { to: r.email, registrationId: r.id, vars: regVars(r), quiet: true });
    run('UPDATE registration SET reminders_sent = reminders_sent + 1, last_reminder_at = ? WHERE id = ?', now(), r.id);
    n++;
  }
  return n;
}

const alerted = new Set<string>();
/** Gateway took money but the webhook is late: ask the gateway API; alert after the configured minutes. */
export async function resolveProcessing() {
  const orders = all("SELECT o.*, (SELECT event_id FROM registration WHERE id = json_extract(o.covers, '$[0].registrationId')) AS event_id FROM payment_order o WHERE o.status = 'processing' AND o.updated_at < ?", new Date(Date.now() - 60_000).toISOString());
  for (const o of orders) {
    const st = await resolveOrder(o.id);
    const mins = o.event_id ? eventSettings(o.event_id).processingAlertMinutes : 15;
    if (st !== 'paid' && new Date(o.updated_at).getTime() < Date.now() - mins * 60_000 && !alerted.has(o.id)) {
      alerted.add(o.id);
      notifyStaff(['cfo', 'registration_exec'], 'staff_alert', { title: 'Payment still processing', message: `Order ${o.id} (${o.gateway}) has been processing for over ${mins} minutes. Check the gateway dashboard.` }, o.event_id);
    }
  }
}

let lastDaily = '';
function daily() {
  const day = now().slice(0, 10);
  if (day === lastDaily) return;
  lastDaily = day;
  try { dailyBackup(); } catch (e) { console.error('[backup]', e); notifyStaff(['admin', 'superadmin'], 'staff_alert', { title: 'Daily backup failed', message: String((e as Error).message) }); }
  const u = unsettledPayments(3);
  if (u.length) notifyStaff(['cfo', 'accountant'], 'staff_alert', { title: 'Daily reconciliation', message: `${u.length} captured gateway payment(s) older than 3 days are not in any settlement. Import the settlement report and check for mismatches.` });
}

export async function tick() {
  return asSystem(async () => {
    const out = { expired: expireHolds(), warned: holdWarnings(), reminded: paymentReminders(), escalated: escalateStale(), commissionReleased: Number(releaseHolds()) };
    await resolveProcessing();
    await syncDue().catch((e) => console.error('[sheets]', e));
    daily();
    out['sent' as keyof typeof out] = await deliverPending();
    return out;
  });
}

let timer: NodeJS.Timeout | null = null;
export function startJobs(intervalMs = 60_000) {
  if (timer) return;
  const loop = () => tick().catch((e) => console.error('[jobs]', e));
  setTimeout(loop, 3000);
  timer = setInterval(loop, intervalMs);
  // Deliver the outbox quickly so confirmation emails arrive within seconds.
  setInterval(() => asSystem(() => deliverPending()).catch((e) => console.error('[mail]', e)), 5000);
}
