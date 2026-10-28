/**
 * Outgoing email. Three ways to send, picked from what is configured (first match wins):
 *  - Resend  (RESEND_API_KEY): HTTPS API, free tier, needs a verified domain or the onboarding sender.
 *  - Brevo   (BREVO_API_KEY): HTTPS API, free tier, works with a single verified sender address.
 *  - SMTP    (SMTP_URL): any mail server, e.g. Gmail with an app password.
 * The HTTPS providers work on hosts that block outbound SMTP ports.
 */
import nodemailer from 'nodemailer';
import { config } from '../config.ts';

export interface Mail { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[]; headers?: Record<string, string> }
export type Provider = 'resend' | 'brevo' | 'smtp' | null;

export function mailProvider(): Provider {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (config.smtpUrl) return 'smtp';
  return null;
}
export const mailConfigured = () => mailProvider() !== null;

/** "Name <addr@x>" → { name, email } */
function sender() {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(config.mailFrom);
  return m ? { name: m[1].replace(/^"|"$/g, '') || 'DelegateDesk', email: m[2] } : { name: 'DelegateDesk', email: config.mailFrom.trim() };
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
export function resetMailer() { transport = null; }

async function http(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body) });
  const text = await r.text();
  let data: any = null; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`Email provider refused the message (${r.status}): ${typeof data === 'string' ? data.slice(0, 200) : data?.message ?? data?.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  return data;
}

/** Send one email. Returns the provider's message id. Throws if the provider refuses. */
export async function sendMail(m: Mail): Promise<{ id: string | null; provider: Provider }> {
  const p = mailProvider();
  const from = sender();
  if (p === 'resend') {
    const d = await http(`${process.env.RESEND_BASE_URL ?? 'https://api.resend.com'}/emails`, { authorization: `Bearer ${process.env.RESEND_API_KEY}` }, {
      from: `${from.name} <${from.email}>`, to: [m.to], subject: m.subject, text: m.text, headers: m.headers,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
    });
    return { id: d?.id ?? null, provider: p };
  }
  if (p === 'brevo') {
    const d = await http(`${process.env.BREVO_BASE_URL ?? 'https://api.brevo.com'}/v3/smtp/email`, { 'api-key': String(process.env.BREVO_API_KEY) }, {
      sender: from, to: [{ email: m.to }], subject: m.subject, textContent: m.text, headers: m.headers,
      attachment: m.attachments?.map((a) => ({ name: a.filename, content: a.content.toString('base64') })),
    });
    return { id: d?.messageId ?? null, provider: p };
  }
  if (p === 'smtp') {
    transport ??= nodemailer.createTransport(config.smtpUrl);
    const info = await transport.sendMail({ from: config.mailFrom, to: m.to, subject: m.subject, text: m.text, attachments: m.attachments, headers: m.headers });
    return { id: info?.messageId ?? null, provider: p };
  }
  throw new Error('No email service is set up');
}
