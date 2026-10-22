import crypto from 'node:crypto';
import { config } from '../config.ts';

/**
 * Second channels for delegate messages. Business-initiated WhatsApp and Indian SMS both require pre-approved
 * templates (Meta template review; DLT registration for SMS), so each message is sent as a named template plus
 * ordered parameters taken from the message's merge fields.
 */
export interface ChannelMessage { to: string; providerTemplate: string | null; language: string; params: string[]; body: string }
export interface ChannelResult { providerMessageId: string | null }

/** Indian mobile in E.164 digits without '+', e.g. 919876543210. */
export const e164 = (mobile: string) => { const d = String(mobile).replace(/\D/g, ''); return d.length === 10 ? `91${d}` : d; };

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data?.error ?? data).slice(0, 300)}`);
  return data;
}

// ---------- WhatsApp Business Cloud API (Meta) ----------
export const whatsapp = {
  configured: () => !!(config.whatsapp.token && config.whatsapp.phoneNumberId),
  async send(m: ChannelMessage): Promise<ChannelResult> {
    if (!m.providerTemplate) throw new Error('No approved WhatsApp template name is set for this message');
    const data = await post(`${config.whatsapp.apiBase}/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`, { authorization: `Bearer ${config.whatsapp.token}` }, {
      messaging_product: 'whatsapp', to: e164(m.to), type: 'template',
      template: { name: m.providerTemplate, language: { code: m.language || 'en' }, components: m.params.length ? [{ type: 'body', parameters: m.params.map((text) => ({ type: 'text', text: text.slice(0, 1000) })) }] : [] },
    });
    return { providerMessageId: data?.messages?.[0]?.id ?? null };
  },
  /** Webhook POSTs are signed: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
  verifySignature(raw: string, header: string | undefined) {
    if (!config.whatsapp.appSecret || !header) return false;
    const want = 'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret).update(raw).digest('hex');
    return want.length === header.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(header));
  },
  /** Delivery receipts: entry[].changes[].value.statuses[] with id and sent | delivered | read | failed. */
  parseStatuses(body: any): { id: string; status: string; error?: string }[] {
    const out: { id: string; status: string; error?: string }[] = [];
    for (const e of body?.entry ?? []) for (const c of e.changes ?? []) for (const s of c.value?.statuses ?? []) {
      out.push({ id: s.id, status: s.status, error: s.errors?.[0]?.title ?? s.errors?.[0]?.message });
    }
    return out;
  },
};

// ---------- SMS via MSG91 Flow API (DLT-registered templates) ----------
export const sms = {
  configured: () => !!config.msg91.authKey,
  async send(m: ChannelMessage, paramNames: string[]): Promise<ChannelResult> {
    if (!m.providerTemplate) throw new Error('No DLT / MSG91 template id is set for this message');
    const recipient: Record<string, string> = { mobiles: e164(m.to) };
    paramNames.forEach((name, i) => { recipient[name] = m.params[i] ?? ''; });
    const data = await post(`${config.msg91.apiBase}/api/v5/flow`, { authkey: config.msg91.authKey }, { template_id: m.providerTemplate, short_url: '0', recipients: [recipient] });
    if (data?.type && data.type !== 'success') throw new Error(`MSG91: ${data.message ?? JSON.stringify(data)}`);
    return { providerMessageId: data?.message ? String(data.message) : null };
  },
};
