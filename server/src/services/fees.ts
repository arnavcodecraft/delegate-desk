import { all, one } from '../db.ts';
import { eventSettings, getEvent } from '../settings.ts';
import { bad, bp, now } from '../util.ts';

export interface Quote {
  tierId: string | null; tierName: string; category: string;
  basePaise: number; premiumPaise: number; discountPaise: number; discountLabel: string | null; couponId: string | null;
  netPaise: number; gstPaise: number; totalPaise: number; gstRateBp: number;
  payNowPaise: number; feeModel: string;
}

export function activeTier(eventId: string, category: string, at = now()) {
  const tiers = all(`SELECT * FROM fee_tier WHERE event_id = ? AND category = ? AND active = 1
      AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)
      AND (quota IS NULL OR used < quota) ORDER BY sort, starts_at`, eventId, category, at, at);
  return tiers[0] ?? null;
}

export function findCoupon(eventId: string, code: string | null | undefined) {
  if (!code) return null;
  const c = one('SELECT * FROM coupon WHERE event_id = ? AND upper(code) = upper(?) AND active = 1', eventId, code.trim());
  if (!c) throw bad('That coupon code is not valid');
  if (c.expires_at && c.expires_at < now()) throw bad('That coupon has expired');
  if (c.max_uses != null && c.used >= c.max_uses) throw bad('That coupon has reached its usage limit');
  return c;
}

/**
 * Live fee shown before the delegate pays: tier by date/quota, premium for high-demand portfolios,
 * the better of coupon and group discount, then GST on the net value.
 */
export function quote(eventId: string, o: { category: string; couponCode?: string | null; premiumPaise?: number; groupSize?: number }): Quote {
  const ev = getEvent(eventId);
  const s = eventSettings(ev);
  const tier = activeTier(eventId, o.category);
  if (!tier) throw bad(`Registration for the ${o.category} category is not open right now`);
  const base = tier.amount_paise;
  const premium = s.premiumPricing ? o.premiumPaise ?? 0 : 0;
  const gross = base + premium;
  const candidates: { amount: number; label: string; couponId: string | null }[] = [];
  const c = findCoupon(eventId, o.couponCode);
  if (c) candidates.push({ amount: c.kind === 'percent' ? bp(gross, c.value) : Math.min(c.value, gross), label: `Coupon ${c.code}`, couponId: c.id });
  if (s.groupDiscount && (o.groupSize ?? 1) >= s.groupDiscount.minSize) {
    candidates.push({ amount: bp(gross, s.groupDiscount.rateBp), label: `Group discount (${o.groupSize} delegates)`, couponId: null });
  }
  const best = candidates.sort((a, b) => b.amount - a.amount)[0];
  const discount = best?.amount ?? 0;
  const net = gross - discount;
  const gst = s.gstEnabled ? bp(net, s.gstRateBp) : 0;
  const total = net + gst;
  const app = s.feeModel === 'two_stage' ? Math.min(s.applicationFeePaise, total) : total;
  return {
    tierId: tier.id, tierName: tier.name, category: o.category, basePaise: base, premiumPaise: premium,
    discountPaise: discount, discountLabel: best?.label ?? null, couponId: best?.couponId ?? null,
    netPaise: net, gstPaise: gst, totalPaise: total, gstRateBp: s.gstEnabled ? s.gstRateBp : 0,
    payNowPaise: app, feeModel: s.feeModel,
  };
}

/** What a registration owes right now (balance, or only the application fee before acceptance). */
export function balanceOf(reg: Record<string, any>) {
  return reg.total_paise - (reg.paid_paise - reg.refunded_paise);
}
export function payableNow(reg: Record<string, any>) {
  const bal = balanceOf(reg);
  if (bal <= 0 || reg.cancelled_at) return 0;
  const s = eventSettings(reg.event_id);
  // Review mode: an application owes nothing until the team assigns it a seat.
  if (reg.allot_status === 'applied') return 0;
  if (s.feeModel === 'two_stage' && !reg.accepted) return Math.max(0, Math.min(bal, s.applicationFeePaise - reg.paid_paise));
  return bal;
}
