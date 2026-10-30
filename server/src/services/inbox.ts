/**
 * The platform team's inbox: messages from the Contact page and requests for DelegateDesk's services
 * (mentorship, recorded courses, batch classes, logistics, EB support, legal and financial consultancy).
 * Stored in the platform database; the team is alerted and the sender gets an acknowledgement.
 */
import crypto from 'node:crypto';
import { platformDb, MAIN, inWorkspace } from '../platform.ts';
import { bad, isEmail, now } from '../util.ts';
import { enqueue, notifyStaff } from './notify.ts';

let ready = false;
const D = () => {
  const d = platformDb();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS inbox_message (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, topic TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, organisation TEXT,
      message TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'new', note TEXT, created_at TEXT NOT NULL, handled_at TEXT);
      CREATE INDEX IF NOT EXISTS ix_inbox_status ON inbox_message(status, created_at);`);
    ready = true;
  }
  return d;
};

export const CONTACT_TOPICS: Record<string, string> = { organiser: 'Running a conference', delegate: 'I am a delegate', services: 'Services', partnership: 'Partnerships and sponsorship', press: 'Press', other: 'Something else' };
export const SERVICES: Record<string, { title: string; for: string }> = {
  mentorship: { title: 'One-to-one live mentorship', for: 'delegates' },
  recorded: { title: 'Recorded courses', for: 'delegates' },
  batch: { title: 'Batch live classes', for: 'delegates and schools' },
  logistics: { title: 'Logistics support', for: 'organisers' },
  eb: { title: 'EB support', for: 'organisers' },
  consultancy: { title: 'Legal and financial consultancy', for: 'organisers' },
};

const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
function save(kind: 'contact' | 'service', topic: string, b: Record<string, any>, details: Record<string, string>) {
  const name = clean(b.name, 120), email = clean(b.email, 254).toLowerCase(), message = clean(b.message, 3000);
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Enter your name';
  if (!isEmail(email)) errors.email = 'Enter a valid email';
  if (kind === 'contact' && message.length < 10) errors.message = 'Tell us a little more (at least 10 characters)';
  if (Object.keys(errors).length) throw bad('Please fix the highlighted fields', { fields: errors });
  const id = crypto.randomUUID();
  D().prepare('INSERT INTO inbox_message (id, kind, topic, name, email, phone, organisation, message, details, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, kind, topic, name, email, clean(b.phone, 30) || null, clean(b.organisation, 160) || null, message || '(no message)', JSON.stringify(details), now());
  const label = kind === 'service' ? SERVICES[topic].title : CONTACT_TOPICS[topic];
  // Alert the platform team (main workspace admins) and acknowledge the sender.
  inWorkspace(MAIN, () => {
    notifyStaff(['superadmin', 'admin'], 'staff_alert', { title: kind === 'service' ? `Service request: ${label}` : `New message: ${label}`, message: `${name} (${email}) wrote: ${(message || '').slice(0, 300)}. Open Settings → Inbox to reply.` });
    enqueue('inbox_received', { to: email, recipientKind: 'person', vars: { name, topic: label } });
  });
  return { id };
}

export function contact(b: Record<string, any>) {
  if (b.website) return { id: 'ok' };   // the hidden field only bots fill in
  const topic = CONTACT_TOPICS[String(b.topic)] ? String(b.topic) : 'other';
  return save('contact', topic, b, {});
}
export function requestService(b: Record<string, any>) {
  if (b.website) return { id: 'ok' };
  const topic = String(b.service ?? '');
  if (!SERVICES[topic]) throw bad('Choose a service');
  const details: Record<string, string> = {};
  for (const k of ['role', 'when', 'size', 'conference', 'city', 'level']) { const v = clean(b[k], 200); if (v) details[k] = v; }
  return save('service', topic, b, details);
}

export function inbox(status?: string) {
  return (D().prepare(`SELECT * FROM inbox_message ${status ? 'WHERE status = ?' : ''} ORDER BY status = 'handled', created_at DESC LIMIT 300`).all(...(status ? [status] : [])) as any[])
    .map((m) => ({ ...m, details: JSON.parse(m.details || '{}'), topic_label: m.kind === 'service' ? SERVICES[m.topic]?.title ?? m.topic : CONTACT_TOPICS[m.topic] ?? m.topic }));
}
export function markHandled(id: string, handled: boolean, note?: string) {
  D().prepare('UPDATE inbox_message SET status = ?, handled_at = ?, note = COALESCE(?, note) WHERE id = ?').run(handled ? 'handled' : 'new', handled ? now() : null, note ? clean(note, 1000) : null, id);
}
export const newCount = () => (D().prepare("SELECT COUNT(*) AS n FROM inbox_message WHERE status = 'new'").get() as any).n as number;
