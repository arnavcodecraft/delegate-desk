import crypto from 'node:crypto';
import { config } from '../config.ts';
import { sha256, token } from '../util.ts';

export type GatewayName = 'razorpay' | 'cashfree' | 'mock';

/** Normalised gateway event, whatever the provider's payload looks like. */
export interface GwPayment {
  kind: 'captured' | 'failed' | 'authorized' | 'refund_processed' | 'refund_failed' | 'other';
  gatewayOrderId: string | null; paymentId: string | null; amountPaise: number; method?: string | null;
  feePaise?: number | null; taxPaise?: number | null; refundId?: string | null; reason?: string | null;
}
export interface CreateOrderInput { orderId: string; amountPaise: number; ref: string; name: string; email: string; mobile: string; returnUrl: string; notifyUrl: string }
export interface CreatedOrder { gatewayOrderId: string; session?: string | null; checkout: Record<string, unknown> }

export interface Gateway {
  name: GatewayName;
  label: string;
  configured(): boolean;
  createOrder(i: CreateOrderInput): Promise<CreatedOrder>;
  verifyWebhook(raw: string, headers: Record<string, string | string[] | undefined>): { valid: boolean; eventId: string };
  parseWebhook(body: any): GwPayment[];
  fetchPayments(gatewayOrderId: string, session?: string | null): Promise<GwPayment[]>;
  refund(p: { gatewayOrderId: string; paymentId: string; amountPaise: number; refundRef: string }): Promise<{ refundId: string; status: 'processed' | 'pending' | 'failed' }>;
}

const h = (headers: Record<string, any>, k: string) => { const v = headers[k.toLowerCase()]; return Array.isArray(v) ? v[0] : (v ?? ''); };
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export const hmacHex = (secret: string, msg: string) => crypto.createHmac('sha256', secret).update(msg).digest('hex');
const hmacB64 = (secret: string, msg: string) => crypto.createHmac('sha256', secret).update(msg).digest('base64');

async function http(url: string, init: RequestInit & { json?: unknown }) {
  const res = await fetch(url, { ...init, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let body: any; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  return body;
}

// ---------------- Razorpay ----------------
// Webhook: X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret); event id in x-razorpay-event-id.
const rzpAuth = () => 'Basic ' + Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
function rzpPayment(e: any, kind?: GwPayment['kind']): GwPayment {
  return {
    kind: kind ?? (e.status === 'captured' ? 'captured' : e.status === 'failed' ? 'failed' : e.status === 'authorized' ? 'authorized' : 'other'),
    gatewayOrderId: e.order_id ?? null, paymentId: e.id ?? null, amountPaise: Number(e.amount ?? 0), method: e.method ?? null,
    feePaise: e.fee ?? null, taxPaise: e.tax ?? null, reason: e.error_description ?? null,
  };
}
export const razorpay: Gateway = {
  name: 'razorpay', label: 'UPI, cards, net banking, wallets (Razorpay)',
  configured: () => !!(config.razorpay.keyId && config.razorpay.keySecret && config.razorpay.webhookSecret),
  async createOrder(i) {
    const o = await http('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { authorization: rzpAuth() },
      json: { amount: i.amountPaise, currency: 'INR', receipt: i.ref.slice(0, 40), notes: { internal_order_id: i.orderId, ref: i.ref } },
    });
    return {
      gatewayOrderId: o.id,
      checkout: { provider: 'razorpay', key: config.razorpay.keyId, order_id: o.id, amount: i.amountPaise, currency: 'INR', prefill: { name: i.name, email: i.email, contact: i.mobile } },
    };
  },
  verifyWebhook(raw, headers) {
    const sig = h(headers, 'x-razorpay-signature');
    const valid = !!sig && !!config.razorpay.webhookSecret && safeEqual(hmacHex(config.razorpay.webhookSecret, raw), sig);
    return { valid, eventId: h(headers, 'x-razorpay-event-id') || sha256(raw) };
  },
  parseWebhook(body) {
    const ev = body?.event as string;
    if (ev?.startsWith('payment.')) {
      const kind = ev === 'payment.captured' ? 'captured' : ev === 'payment.failed' ? 'failed' : ev === 'payment.authorized' ? 'authorized' : 'other';
      return [rzpPayment(body.payload.payment.entity, kind)];
    }
    if (ev === 'order.paid') return [rzpPayment(body.payload.payment.entity, 'captured')];
    if (ev === 'refund.processed' || ev === 'refund.failed') {
      const r = body.payload.refund.entity;
      return [{ kind: ev === 'refund.processed' ? 'refund_processed' : 'refund_failed', gatewayOrderId: null, paymentId: r.payment_id, amountPaise: r.amount, refundId: r.id }];
    }
    return [{ kind: 'other', gatewayOrderId: null, paymentId: null, amountPaise: 0 }];
  },
  async fetchPayments(orderId) {
    const r = await http(`https://api.razorpay.com/v1/orders/${orderId}/payments`, { method: 'GET', headers: { authorization: rzpAuth() } });
    return (r.items ?? []).map((e: any) => rzpPayment(e));
  },
  async refund(p) {
    const r = await http(`https://api.razorpay.com/v1/payments/${p.paymentId}/refund`, { method: 'POST', headers: { authorization: rzpAuth() }, json: { amount: p.amountPaise, receipt: p.refundRef.slice(0, 40) } });
    return { refundId: r.id, status: r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending' };
  },
};

/** Verify the signature Razorpay Checkout returns to the browser (order_id|payment_id keyed with the API secret). */
export function verifyRazorpayCheckout(orderId: string, paymentId: string, signature: string) {
  return !!config.razorpay.keySecret && safeEqual(hmacHex(config.razorpay.keySecret, `${orderId}|${paymentId}`), signature ?? '');
}

// ---------------- Cashfree PG ----------------
// Webhook: x-webhook-signature = base64 HMAC-SHA256(x-webhook-timestamp + raw body, secret key).
// Confirm the header names and API version against Cashfree's current docs before going live.
const cfBase = () => (config.cashfree.env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');
const cfHeaders = () => ({ 'x-client-id': config.cashfree.appId, 'x-client-secret': config.cashfree.secretKey, 'x-api-version': config.cashfree.apiVersion });
function cfPayment(p: any, orderId: string | null): GwPayment {
  const st = String(p.payment_status ?? '').toUpperCase();
  return {
    kind: st === 'SUCCESS' ? 'captured' : ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(st) ? 'failed' : 'other',
    gatewayOrderId: orderId, paymentId: p.cf_payment_id != null ? String(p.cf_payment_id) : null,
    amountPaise: Math.round(Number(p.payment_amount ?? 0) * 100), method: p.payment_group ?? null, reason: p.payment_message ?? null,
  };
}
export const cashfree: Gateway = {
  name: 'cashfree', label: 'UPI, cards, net banking (Cashfree)',
  configured: () => !!(config.cashfree.appId && config.cashfree.secretKey),
  async createOrder(i) {
    const o = await http(`${cfBase()}/orders`, {
      method: 'POST', headers: cfHeaders(),
      json: {
        order_id: i.orderId.replace(/-/g, ''), order_amount: i.amountPaise / 100, order_currency: 'INR',
        customer_details: { customer_id: i.ref.replace(/[^A-Za-z0-9_-]/g, ''), customer_name: i.name, customer_email: i.email, customer_phone: i.mobile },
        order_meta: { return_url: i.returnUrl, notify_url: i.notifyUrl }, order_note: i.ref,
      },
    });
    return { gatewayOrderId: o.order_id, session: o.payment_session_id, checkout: { provider: 'cashfree', mode: config.cashfree.env, paymentSessionId: o.payment_session_id } };
  },
  verifyWebhook(raw, headers) {
    const sig = h(headers, 'x-webhook-signature'); const ts = h(headers, 'x-webhook-timestamp');
    const valid = !!sig && !!ts && !!config.cashfree.secretKey && safeEqual(hmacB64(config.cashfree.secretKey, ts + raw), sig);
    return { valid, eventId: h(headers, 'x-idempotency-key') || sha256(raw) };
  },
  parseWebhook(body) {
    const t = String(body?.type ?? '');
    const d = body?.data ?? {};
    if (t.startsWith('PAYMENT_')) return [cfPayment(d.payment ?? {}, d.order?.order_id ?? null)];
    if (t.startsWith('REFUND_')) {
      const r = d.refund ?? {};
      return [{ kind: r.refund_status === 'SUCCESS' ? 'refund_processed' : r.refund_status === 'FAILED' ? 'refund_failed' : 'other', gatewayOrderId: r.order_id ?? null, paymentId: r.cf_payment_id ? String(r.cf_payment_id) : null, amountPaise: Math.round(Number(r.refund_amount ?? 0) * 100), refundId: r.refund_id ?? null }];
    }
    return [{ kind: 'other', gatewayOrderId: null, paymentId: null, amountPaise: 0 }];
  },
  async fetchPayments(orderId) {
    const r = await http(`${cfBase()}/orders/${orderId}/payments`, { method: 'GET', headers: cfHeaders() });
    return (Array.isArray(r) ? r : []).map((p: any) => cfPayment(p, orderId));
  },
  async refund(p) {
    const r = await http(`${cfBase()}/orders/${p.gatewayOrderId}/refunds`, { method: 'POST', headers: cfHeaders(), json: { refund_amount: p.amountPaise / 100, refund_id: p.refundRef.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), refund_note: 'Delegate refund' } });
    return { refundId: String(r.cf_refund_id ?? r.refund_id), status: r.refund_status === 'SUCCESS' ? 'processed' : r.refund_status === 'CANCELLED' ? 'failed' : 'pending' };
  },
};

// ---------------- Sandbox ----------------
// A built-in test gateway. Its checkout page posts a *signed* webhook through exactly the same verification,
// idempotency and posting path as the real gateways, so the whole money flow can be tried without keys.
export const sandboxSecret = () => hmacHex(config.appSecret, 'sandbox-webhook-secret');
export const mock: Gateway = {
  name: 'mock', label: 'Sandbox test payment (no real money)',
  configured: () => true,
  async createOrder(i) {
    const id = `sbx_order_${token(9)}`;
    return { gatewayOrderId: id, session: JSON.stringify({ payments: [] }), checkout: { provider: 'mock', url: `/pay/sandbox/${i.orderId}` } };
  },
  verifyWebhook(raw, headers) {
    const sig = h(headers, 'x-sandbox-signature');
    return { valid: !!sig && safeEqual(hmacHex(sandboxSecret(), raw), sig), eventId: h(headers, 'x-sandbox-event-id') || sha256(raw) };
  },
  parseWebhook: (body) => razorpay.parseWebhook(body),
  async fetchPayments(_orderId, session) {
    const s = JSON.parse(session ?? '{}');
    return (s.payments ?? []).map((e: any) => rzpPayment(e));
  },
  async refund() { return { refundId: `sbx_rfnd_${token(8)}`, status: 'processed' }; },
};

export const gateways: Record<GatewayName, Gateway> = { razorpay, cashfree, mock };

// Simple health tracking: a gateway that fails to create orders is hidden for a few minutes.
const unhealthyUntil = new Map<string, number>();
export const markUnhealthy = (g: string, minutes = 10) => unhealthyUntil.set(g, Date.now() + minutes * 60_000);
export const isHealthy = (g: string) => (unhealthyUntil.get(g) ?? 0) < Date.now();
export const markHealthy = (g: string) => unhealthyUntil.delete(g);
