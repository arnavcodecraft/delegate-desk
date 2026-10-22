import nodemailer from 'nodemailer';
import { all, one, run, insert } from '../db.ts';
import { config } from '../config.ts';
import { orgSettings } from '../settings.ts';
import { addHours, istHour, now, uid } from '../util.ts';

type Tpl = { subject: string; body: string };
// Admins edit these from the Templates screen; these are only the first-run defaults.
export const DEFAULT_TEMPLATES: Record<string, Tpl> = {
  registration_saved: {
    subject: 'You are in: {{committee}} – {{portfolio}} ({{ref}})',
    body: `Hi {{name}},\n\nThank you for registering for {{event_name}}. We have provisionally allotted you:\n\nCommittee: {{committee}}\nPortfolio: {{portfolio}}\n\nAmount due: {{amount}}\nPlease pay by {{due_date}} to keep this seat. After that it returns to the pool.\n\nPay now: {{payment_link}}\n\nYour delegate page (no password needed): {{portal_link}}\n\nRegards,\n{{event_name}} Secretariat`,
  },
  waitlisted: {
    subject: 'You are on the waitlist for {{event_name}} (position {{waitlist_position}})',
    body: `Hi {{name}},\n\nAll seats in your preferred committees are currently taken, so you are number {{waitlist_position}} on the waitlist. We will email you the moment a seat frees up.\n\nYour delegate page: {{portal_link}}`,
  },
  payment_confirmed: {
    subject: 'Payment received – your seat is confirmed ({{ref}})',
    body: `Hi {{name}},\n\nWe have received {{amount}}. Your allotment is now confirmed:\n\nCommittee: {{committee}}\nPortfolio: {{portfolio}}\n\nBackground guide: {{guide_link}}\nYour receipt and GST invoice are attached and always available at {{portal_link}}\n\nNext step: complete your profile (dietary needs, T-shirt size, emergency contact) at {{portal_link}}`,
  },
  part_payment: {
    subject: 'Part payment received ({{ref}})',
    body: `Hi {{name}},\n\nWe have received {{paid}}. A balance of {{amount}} is still due by {{due_date}}.\n\nPay the balance: {{payment_link}}`,
  },
  screenshot_submitted: {
    subject: 'Payment proof received – under review',
    body: `Hi {{name}},\n\nWe have received your payment proof (UTR {{utr}}, {{paid}}). Our finance team will verify it against the bank statement, usually within a day. Your seat stays held while we review.\n\n{{portal_link}}`,
  },
  screenshot_review_cfo: {
    subject: 'New payment proof to review: {{ref}} {{name}}',
    body: `A new payment proof is waiting for review.\n\nDelegate: {{name}} ({{ref}})\nUTR: {{utr}}\nAmount entered: {{paid}}\nExpected: {{amount}}\n\nReview queue: {{review_link}}`,
  },
  screenshot_rejected: {
    subject: 'Action needed: please re-upload your payment proof',
    body: `Hi {{name}},\n\nWe could not verify your payment proof.\n\nReason: {{reason}}\n\nPlease upload again here: {{upload_link}}`,
  },
  payment_reminder: {
    subject: 'Reminder: complete your payment for {{event_name}}',
    body: `Hi {{name}},\n\nYour seat ({{committee}} – {{portfolio}}) is held until {{due_date}}. Amount due: {{amount}}.\n\nPay now: {{payment_link}}\n\nTo stop reminders, reply STOP or use {{unsubscribe_link}}`,
  },
  hold_expiring: {
    subject: 'Last chance to keep your seat in {{committee}}',
    body: `Hi {{name}},\n\nYour hold on {{portfolio}} in {{committee}} expires at {{due_date}}. Pay {{amount}} now to keep it: {{payment_link}}`,
  },
  seat_released: {
    subject: 'Your provisional seat has been released',
    body: `Hi {{name}},\n\nThe payment window for {{portfolio}} ({{committee}}) has closed, so the seat has returned to the pool. You can still pay from {{portal_link}} and we will allot the best available seat.`,
  },
  waitlist_promoted: {
    subject: 'Good news: a seat is yours – {{committee}} {{portfolio}}',
    body: `Hi {{name}},\n\nA seat opened up and we have allotted you {{portfolio}} in {{committee}}. Please pay {{amount}} by {{due_date}} to keep it.\n\nPay now: {{payment_link}}`,
  },
  allocation_changed: {
    subject: 'Your allotment has changed: {{committee}} – {{portfolio}}',
    body: `Hi {{name}},\n\nYour allotment is now:\n\nCommittee: {{committee}}\nPortfolio: {{portfolio}}\n\nReason: {{reason}}\n\n{{portal_link}}`,
  },
  allocation_changed_chair: {
    subject: '[{{committee}}] Delegate allotment changed: {{name}}',
    body: `{{name}} ({{institution}}) is now {{portfolio}} in {{committee}}. Reason: {{reason}}`,
  },
  refund_approved: {
    subject: 'Your refund of {{amount}} has been approved',
    body: `Hi {{name}},\n\nYour refund of {{amount}} has been approved and will be sent by {{method}}. Expect it within {{expected}}.\n\nReference: {{reference}}`,
  },
  referral_registered: {
    subject: 'New referral: {{delegate}} registered',
    body: `Hi {{name}},\n\n{{delegate}} just registered using your name. You now have {{count}} paid registrations and are on the {{slab}} slab.{{next_slab}}\n\nYour live statement: {{statement_link}}`,
  },
  commission_statement: {
    subject: 'Commission statement and payout {{payout_ref}}',
    body: `Hi {{name}},\n\nWe have paid your commission.\n\nGross: {{gross}}\nTDS: {{tds}}\nNet paid: {{net}}\nReference: {{reference}}\n\nYour statement is attached.`,
  },
  expense_above_limit: {
    subject: 'Approval needed: expense {{expense_ref}} for {{amount}}',
    body: `{{requester}} submitted an expense above the accountant's limit.\n\n{{description}} – {{amount}} ({{category}})\n\nApprove or reject: {{approve_link}}`,
  },
  event_reminder: {
    subject: '{{event_name}}: see you soon',
    body: `Hi {{name}},\n\n{{event_name}} runs {{event_dates}} at {{venue}}.\nReporting time: {{reporting_time}}\nDress code: {{dress_code}}\n\nCommittee: {{committee}} – {{portfolio}}`,
  },
  guardian_consent: {
    subject: 'Consent needed for {{name}} to attend {{event_name}}',
    body: `Dear {{guardian_name}},\n\n{{name}} has registered for {{event_name}}. Because they are under 18, we need a parent's or school's consent before we store anything beyond their basic registration.\n\nGive consent: {{consent_link}}\n\nPrivacy notice: {{privacy_link}}`,
  },
  portal_link: {
    subject: 'Your {{event_name}} delegate page',
    body: `Hi {{name}},\n\nHere is your personal link (keep it private): {{portal_link}}`,
  },
  staff_alert: {
    subject: '[Alert] {{title}}',
    body: `{{message}}`,
  },
  delegation_created: {
    subject: 'Delegation registered: {{institution}} ({{count}} delegates)',
    body: `Hi {{name}},\n\nYour delegation from {{institution}} is registered with {{count}} members. Manage members and see allotments here: {{delegation_link}}\n\n{{payment_note}}`,
  },
};

export function seedTemplates() {
  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    run('INSERT OR IGNORE INTO template (key, channel, subject, body, active, updated_at) VALUES (?,?,?,?,1,?)', key, 'email', t.subject, t.body, now());
  }
  // WhatsApp copies use pre-approved template wording; only sent where the delegate consented.
  for (const key of ['registration_saved', 'payment_confirmed', 'payment_reminder', 'hold_expiring', 'event_reminder']) {
    const t = DEFAULT_TEMPLATES[key];
    run('INSERT OR IGNORE INTO template (key, channel, subject, body, active, updated_at) VALUES (?,?,?,?,1,?)', key, 'whatsapp', t.subject, t.body.split('\n\n').slice(0, 3).join('\n\n'), now());
  }
}

export function render(text: string, vars: Record<string, unknown>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

export interface EnqueueOpts {
  to: string; registrationId?: string | null; vars: Record<string, unknown>; recipientKind?: string;
  attachments?: { kind: string; id: string }[]; quiet?: boolean; at?: string; channel?: 'email' | 'whatsapp' | 'sms';
}

/** Write a message into the outbox. Called inside the same transaction as the state change. */
export function enqueue(key: string, o: EnqueueOpts) {
  const channel = o.channel ?? 'email';
  const t = one('SELECT * FROM template WHERE key = ? AND channel = ?', key, channel);
  const tpl = t ?? (channel === 'email' ? DEFAULT_TEMPLATES[key] : undefined);
  if (!tpl || (t && !t.active) || !o.to) return null;
  let status = 'queued'; let lastError: string | null = null;
  if (o.registrationId) {
    const r = one('SELECT email_bounced, unsubscribed, whatsapp_consent, erased_at FROM registration WHERE id = ?', o.registrationId);
    if (r?.erased_at) return null;
    if (channel === 'email' && r?.email_bounced) { status = 'suppressed'; lastError = 'Address bounced earlier; fix the email and resend'; }
    if (o.quiet && r?.unsubscribed) { status = 'suppressed'; lastError = 'Delegate unsubscribed from reminders'; }
    if (channel !== 'email' && !r?.whatsapp_consent) return null;
  }
  const id = uid();
  insert('notification', {
    id, registration_id: o.registrationId ?? null, recipient: o.to, recipient_kind: o.recipientKind ?? 'delegate', channel,
    template_key: key, subject: render(tpl.subject, o.vars), body: render(tpl.body, o.vars),
    attachments: JSON.stringify(o.attachments ?? []), status, last_error: lastError,
    respect_quiet_hours: o.quiet ? 1 : 0, scheduled_at: o.at ?? now(), created_at: now(),
  });
  // Optional second channel for the delegate when they opted in.
  if (channel === 'email' && o.registrationId && o.recipientKind !== 'staff') {
    const r = one('SELECT mobile, whatsapp_consent FROM registration WHERE id = ?', o.registrationId);
    if (r?.whatsapp_consent && one("SELECT 1 FROM template WHERE key = ? AND channel = 'whatsapp' AND active = 1", key)) {
      enqueue(key, { ...o, channel: 'whatsapp', to: r.mobile, attachments: [] });
    }
  }
  return id;
}

/** Email every active staff member holding one of these roles. */
export function notifyStaff(roles: string[], key: string, vars: Record<string, unknown>, eventId?: string | null) {
  const users = all(`SELECT DISTINCT u.email, u.name FROM user u JOIN user_role ur ON ur.user_id = u.id
     WHERE u.active = 1 AND ur.role IN (${roles.map(() => '?').join(',')}) AND (ur.event_id IS NULL OR ur.event_id = ? OR ? IS NULL)`, ...roles, eventId ?? null, eventId ?? null);
  for (const u of users) enqueue(key, { to: u.email, recipientKind: 'staff', vars: { staff_name: u.name, ...vars } });
}

// ---------- delivery ----------
export type AttachmentBuilder = (id: string) => Promise<{ filename: string; content: Buffer }>;
const attachmentBuilders: Record<string, AttachmentBuilder> = {};
export function registerAttachment(kind: string, fn: AttachmentBuilder) { attachmentBuilders[kind] = fn; }

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function mailer() {
  if (!config.smtpUrl) return null;
  transport ??= nodemailer.createTransport(config.smtpUrl);
  return transport;
}

const BACKOFF_MIN = [1, 5, 30, 120, 360];

export async function deliverPending(limit?: number) {
  const s = orgSettings();
  const perMinute = limit ?? s.emailsPerMinute;
  const sentLastMinute = one("SELECT COUNT(*) AS n FROM notification WHERE status = 'sent' AND sent_at > ?", new Date(Date.now() - 60_000).toISOString())?.n ?? 0;
  const budget = Math.max(0, perMinute - sentLastMinute);
  if (!budget) return 0;
  const due = all("SELECT * FROM notification WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT ?", now(), budget);
  const hour = istHour();
  const quiet = s.quietHours.start > s.quietHours.end ? hour >= s.quietHours.start || hour < s.quietHours.end : hour >= s.quietHours.start && hour < s.quietHours.end;
  let sent = 0;
  for (const n of due) {
    if (n.respect_quiet_hours && quiet) {
      const hoursUntilEnd = (s.quietHours.end - hour + 24) % 24 || 1;
      run('UPDATE notification SET scheduled_at = ? WHERE id = ?', addHours(new Date(), hoursUntilEnd), n.id);
      continue;
    }
    try {
      await send(n);
      run("UPDATE notification SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = ? WHERE id = ?", now(),
        n.channel === 'email' && !config.smtpUrl ? 'No SMTP configured: message logged, not delivered' : n.channel !== 'email' ? 'Logged: no WhatsApp/SMS provider configured' : null, n.id);
      sent++;
    } catch (e: any) {
      const attempts = n.attempts + 1;
      const failed = attempts >= BACKOFF_MIN.length;
      run('UPDATE notification SET status = ?, attempts = ?, last_error = ?, scheduled_at = ? WHERE id = ?',
        failed ? 'failed' : 'queued', attempts, String(e?.message ?? e).slice(0, 500), addHours(new Date(), BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)] / 60), n.id);
    }
  }
  return sent;
}

async function send(n: any) {
  if (n.channel !== 'email') return; // WhatsApp/SMS: plug a BSP here (approved templates only).
  const m = mailer();
  if (!m) return;
  const atts = [];
  for (const a of JSON.parse(n.attachments || '[]')) {
    const b = attachmentBuilders[a.kind];
    if (b) atts.push(await b(a.id));
  }
  const unsubscribe = n.registration_id ? `${config.baseUrl}/api/public/unsubscribe/${n.registration_id}` : undefined;
  await m.sendMail({
    from: config.mailFrom, to: n.recipient, subject: n.subject, text: n.body, attachments: atts,
    headers: unsubscribe && n.respect_quiet_hours ? { 'List-Unsubscribe': `<${unsubscribe}>` } : undefined,
  });
}

/** Called by the email provider's bounce webhook. */
export function markBounced(email: string, reason = 'bounced') {
  run("UPDATE notification SET status = 'bounced', last_error = ? WHERE recipient = ? AND status IN ('sent','queued')", reason, email);
  run('UPDATE registration SET email_bounced = 1 WHERE lower(email) = lower(?)', email);
}
