import { all, one, update } from '../db.ts';
import { audit } from '../audit.ts';
import { json, normalizeName, normMobile, similarity, notFound, conflict } from '../util.ts';

export interface Match { state: 'none' | 'linked' | 'unmatched'; referrerId: string | null; suggestions: { id: string; name: string; score: number }[] }

/** Clean the typed referral name, then exact-match against names and known aliases; otherwise queue it. */
export function matchReferral(orgId: string, typed: string | null | undefined): Match {
  const n = normalizeName(typed ?? '');
  if (!n) return { state: 'none', referrerId: null, suggestions: [] };
  const refs = all('SELECT id, name, normalized, aliases FROM referrer WHERE org_id = ? AND active = 1', orgId);
  for (const r of refs) {
    if (r.normalized === n || json<string[]>(r.aliases, []).map(normalizeName).includes(n)) return { state: 'linked', referrerId: r.id, suggestions: [] };
  }
  const suggestions = refs
    .map((r) => ({ id: r.id, name: r.name, score: Math.max(similarity(n, r.normalized), ...json<string[]>(r.aliases, []).map((a) => similarity(n, a))) }))
    .filter((s) => s.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, 3)
    .map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }));
  return { state: 'unmatched', referrerId: null, suggestions };
}

/** Public autocomplete: names only, never contact details. */
export function suggestReferrers(orgId: string, q: string) {
  const n = normalizeName(q);
  if (n.length < 2) return [];
  return all('SELECT id, name, normalized, aliases FROM referrer WHERE org_id = ? AND active = 1', orgId)
    .map((r) => ({ name: r.name, score: r.normalized.startsWith(n) ? 1.5 : r.normalized.split(' ').some((w: string) => w.startsWith(n)) ? 1.2 : similarity(n, r.normalized) }))
    .filter((r) => r.score >= 0.6).sort((a, b) => b.score - a.score).slice(0, 8).map((r) => r.name);
}

export function isSelfReferral(referrerId: string | null, email: string, mobile: string) {
  if (!referrerId) return false;
  const r = one('SELECT email, mobile FROM referrer WHERE id = ?', referrerId);
  if (!r) return false;
  return (!!r.email && r.email.toLowerCase() === email.toLowerCase()) || (!!r.mobile && normMobile(r.mobile) === normMobile(mobile));
}

/** Admin links an unmatched name (or marks "no referrer"). Optionally learn the spelling as an alias. */
export function linkReferral(regId: string, referrerId: string | null, learnAlias = true) {
  const reg = one('SELECT * FROM registration WHERE id = ?', regId);
  if (!reg) throw notFound('Registration');
  if (referrerId && !one('SELECT 1 FROM referrer WHERE id = ?', referrerId)) throw notFound('Referrer');
  const patch = {
    referrer_id: referrerId, referral_state: referrerId ? 'linked' : 'no_referrer', referral_suggestions: null,
    self_referral: isSelfReferral(referrerId, reg.email, reg.mobile) ? 1 : 0,
  };
  update('registration', regId, patch);
  if (referrerId && learnAlias && reg.referral_name) {
    const r = one('SELECT aliases, normalized FROM referrer WHERE id = ?', referrerId)!;
    const aliases = json<string[]>(r.aliases, []);
    const n = normalizeName(reg.referral_name);
    if (n !== r.normalized && !aliases.includes(n)) update('referrer', referrerId, { aliases: JSON.stringify([...aliases, n]) });
  }
  audit('referral.link', 'registration', regId, { referrer_id: reg.referrer_id, referral_state: reg.referral_state }, patch);
  return { ...reg, ...patch, previousReferrerId: reg.referrer_id as string | null };
}

export function ensureReferralEditable(reg: Record<string, any>, isAdmin: boolean) {
  if (!isAdmin && reg.payment_status === 'paid') throw conflict('The referral name can only be changed by an admin once payment is confirmed');
}
