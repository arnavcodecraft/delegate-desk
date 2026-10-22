import { one, update } from './db.ts';
import { json, notFound } from './util.ts';
import { audit } from './audit.ts';

export const EXPENSE_CATEGORIES = [
  'venue', 'catering', 'printing', 'stationery', 'merchandise', 'awards', 'marketing', 'technology', 'travel',
  'accommodation', 'honorarium', 'security', 'photography', 'decor', 'miscellaneous',
] as const;

export interface GatewayToggle { enabled: boolean; down: boolean }
export interface EventSettings {
  holdHours: number;
  holdGraceHours: number;           // extra hold while a screenshot is under review
  holdWarningHours: number;
  gstEnabled: boolean;
  gstRateBp: number;
  sacCode: string;
  feeModel: 'full' | 'two_stage';   // two_stage = application fee, then balance after acceptance
  applicationFeePaise: number;
  groupPayment: 'members_pay' | 'head_pays';
  groupDiscount: { minSize: number; rateBp: number } | null;
  gateways: { razorpay: GatewayToggle; cashfree: GatewayToggle; mock: GatewayToggle };
  defaultGateway: 'razorpay' | 'cashfree' | 'mock';
  routing: { maxPaise: number; gateway: 'razorpay' | 'cashfree' | 'mock' }[];
  screenshotEnabled: boolean;
  reminderHours: number[];
  escalationHours: number;
  processingAlertMinutes: number;
  refundWindowDays: number;
  allocationLockAt: string | null;
  detailsLockAt: string | null;
  premiumPricing: boolean;
  maxPerInstitutionPerCommittee: number;
  variableCostPerDelegatePaise: number;
  dressCode: string; reportingTime: string;
  largeRefundPaise: number;          // refunds above this need a second approver
  commissionHoldDays: number;
  unverifiedAlertHours: number;
  requireMobileOtp: boolean;
}

export const defaultEventSettings: EventSettings = {
  holdHours: 48, holdGraceHours: 72, holdWarningHours: 6,
  gstEnabled: true, gstRateBp: 1800, sacCode: '998596',
  feeModel: 'full', applicationFeePaise: 0,
  groupPayment: 'members_pay', groupDiscount: { minSize: 8, rateBp: 1000 },
  gateways: { razorpay: { enabled: true, down: false }, cashfree: { enabled: true, down: false }, mock: { enabled: true, down: false } },
  defaultGateway: 'razorpay', routing: [],
  screenshotEnabled: true,
  reminderHours: [24, 72, 168],
  escalationHours: 24, processingAlertMinutes: 15,
  refundWindowDays: 7,
  allocationLockAt: null, detailsLockAt: null,
  premiumPricing: true,
  maxPerInstitutionPerCommittee: 2,
  variableCostPerDelegatePaise: 35000,
  dressCode: 'Western business formals', reportingTime: '08:30',
  largeRefundPaise: 1000000,
  commissionHoldDays: 7,
  unverifiedAlertHours: 24,
  requireMobileOtp: false,
};

export interface OrgSettings {
  approvalLimits: { accountantExpensePaise: number; accountantJournalPaise: number };
  tds: { commissionRateBp: number; thresholdPaise: number; noPanRateBp: number; section: string };
  quietHours: { start: number; end: number };
  emailsPerMinute: number;
  invoicePrefix: string;
  secondApproverUserId: string | null;
  bulkMessageCap: number;
}
export const defaultOrgSettings: OrgSettings = {
  approvalLimits: { accountantExpensePaise: 2500000, accountantJournalPaise: 5000000 },
  // Commission TDS: 2% from Oct 2024, ₹20,000 yearly threshold (s.194H, s.393 of the Income-tax Act 2025 from Apr 2026).
  // Stored as settings because rates move; confirm with your CA.
  tds: { commissionRateBp: 200, thresholdPaise: 2000000, noPanRateBp: 2000, section: '393 (earlier 194H)' },
  quietHours: { start: 21, end: 8 },
  emailsPerMinute: 120,
  invoicePrefix: 'INV',
  secondApproverUserId: null,
  bulkMessageCap: 5000,
};

function deepMerge<T>(base: T, over: any): T {
  if (over == null || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) && typeof (base as any)?.[k] === 'object' && (base as any)?.[k] !== null
      ? deepMerge((base as any)[k], v) : v;
  }
  return out;
}

export function getEvent(eventId: string) {
  const e = one('SELECT * FROM event WHERE id = ?', eventId);
  if (!e) throw notFound('Event');
  return e;
}
export function eventSettings(eventOrId: string | Record<string, any>): EventSettings {
  const e = typeof eventOrId === 'string' ? getEvent(eventOrId) : eventOrId;
  return deepMerge(defaultEventSettings, json(e.settings, {}));
}
export function getOrg(orgId?: string) {
  const o = orgId ? one('SELECT * FROM organization WHERE id = ?', orgId) : one('SELECT * FROM organization ORDER BY created_at LIMIT 1');
  if (!o) throw notFound('Organisation');
  return o;
}
export function orgSettings(orgId?: string): OrgSettings {
  return deepMerge(defaultOrgSettings, json(getOrg(orgId).settings, {}));
}
export function saveEventSettings(eventId: string, patch: Partial<EventSettings>) {
  const before = eventSettings(eventId);
  const next = deepMerge(before, patch);
  update('event', eventId, { settings: JSON.stringify(next) });
  audit('settings.update', 'event', eventId, before, next);
  return next;
}
export function saveOrgSettings(patch: Partial<OrgSettings>) {
  const org = getOrg();
  const before = orgSettings(org.id);
  const next = deepMerge(before, patch);
  update('organization', org.id, { settings: JSON.stringify(next) });
  audit('settings.update', 'organization', org.id, before, next);
  return next;
}
