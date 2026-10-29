import { all, one, run, insert, tx, update } from '../db.ts';
import { audit } from '../audit.ts';
import { eventSettings } from '../settings.ts';
import { addHours, bad, conflict, ctx, json, now, uid, notFound } from '../util.ts';

export interface SeatPick { seatId: string; committeeId: string; committee: string; committeeShort: string; portfolio: string; tier: string; premiumPaise: number; fallback: boolean }
export type AllocResult = { kind: 'seat'; pick: SeatPick } | { kind: 'waitlist'; position: number };

/**
 * Experience points: MUNs attended + awards won + half the other events (debates, youth parliaments, Model G20 …).
 * Older records only have the first / some / experienced bucket, which still counts.
 */
const BUCKET_POINTS: Record<string, number> = { first: 0, some: 1, experienced: 3 };
export function experiencePoints(r: { mun_count?: number | null; awards_count?: number | null; other_events?: number | null; experience?: string | null }) {
  const counted = (r.mun_count ?? 0) + (r.awards_count ?? 0) + Math.floor((r.other_events ?? 0) / 2);
  return Math.max(counted, BUCKET_POINTS[r.experience ?? 'first'] ?? 0);
}
export const experienceBucket = (points: number) => (points >= 3 ? 'experienced' : points >= 1 ? 'some' : 'first');
const TIER_RANK: Record<string, number> = { high: 0, standard: 1, low: 2 };

function committeesInOrder(eventId: string, prefs: string[], withFallback: boolean) {
  const open = all(`SELECT c.id, c.name, c.short, c.kind,
      (SELECT COUNT(*) FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = c.id AND s.state = 'open') AS open_seats
    FROM committee c WHERE c.event_id = ? ORDER BY c.sort, c.name`, eventId);
  const byId = new Map(open.map((c) => [c.id, c]));
  const preferred = prefs.map((id) => byId.get(id)).filter(Boolean) as typeof open;
  // "Surprise me" starts from the committee with the most open seats.
  if (!prefs.length) return open.sort((a, b) => b.open_seats - a.open_seats).map((c) => ({ ...c, fallback: false }));
  const rest = withFallback ? open.filter((c) => !prefs.includes(c.id)).sort((a, b) => b.open_seats - a.open_seats) : [];
  return [...preferred.map((c) => ({ ...c, fallback: false })), ...rest.map((c) => ({ ...c, fallback: true }))];
}

/**
 * Candidate seats inside one committee, best first: the delegate's chosen portfolio, then the strongest portfolio
 * their experience qualifies for. Portfolios above their experience are never offered; delegation-spreading and
 * double-delegation pairing rules apply as before.
 */
function candidateSeats(reg: Record<string, any>, committee: Record<string, any>, maxPerInstitution: number, o: { points: number; minimum: Record<string, number>; preferredPortfolio?: string | null }) {
  const inst = (reg.institution ?? '').trim().toLowerCase();
  const sameInst = one(`SELECT COUNT(*) AS n FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN registration r ON r.id = s.registration_id
      WHERE p.committee_id = ? AND s.state <> 'open' AND lower(trim(r.institution)) = ? AND r.id <> ?`, committee.id, inst, reg.id)?.n ?? 0;
  const cap = committee.kind === 'double' ? maxPerInstitution * 2 : maxPerInstitution;
  if (maxPerInstitution > 0 && sameInst >= cap) return [];
  const seats = all(`SELECT s.id AS seat_id, s.seat_no, p.id AS portfolio_id, p.name AS portfolio, p.tier, p.premium_paise, p.sort,
      (SELECT r2.delegation_id || '|' || IFNULL(lower(trim(r2.institution)),'') FROM seat s2 JOIN registration r2 ON r2.id = s2.registration_id
         WHERE s2.portfolio_id = p.id AND s2.id <> s.id AND s2.state <> 'open' LIMIT 1) AS partner,
      (SELECT COUNT(*) FROM seat s3 WHERE s3.portfolio_id = p.id AND s3.state <> 'open') AS taken
    FROM seat s JOIN portfolio p ON p.id = s.portfolio_id
    WHERE p.committee_id = ? AND s.state = 'open'`, committee.id);
  return seats
    .filter((s) => o.points >= (o.minimum[s.tier] ?? 0))
    .filter((s) => {
      if (committee.kind !== 'double' || !s.taken) return true;
      // Double delegation: pair two members of the same delegation, or two independents.
      const [partnerDelegation] = String(s.partner ?? '|').split('|');
      return reg.delegation_id ? partnerDelegation === reg.delegation_id : !partnerDelegation;
    })
    .map((s) => ({ ...s, chosen: s.portfolio_id === o.preferredPortfolio ? 0 : 1, pairBonus: committee.kind === 'double' && s.taken ? 0 : 1 }))
    .sort((a, b) => a.chosen - b.chosen || a.pairBonus - b.pairBonus || (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9) || a.sort - b.sort || a.portfolio.localeCompare(b.portfolio) || a.seat_no - b.seat_no);
}

/** Why the delegate didn't get the portfolio they asked for (shown to the team and in the allotment history). */
function whyNotChosen(portfolioId: string, points: number, minimum: Record<string, number>) {
  const p = one(`SELECT p.name, p.tier, (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id AND s.state = 'open') AS open FROM portfolio p WHERE p.id = ?`, portfolioId);
  if (!p) return null;
  const need = minimum[p.tier] ?? 0;
  if (points < need) return `${p.name} needs ${need}+ experience points (has ${points})`;
  if (!p.open) return `${p.name} was already taken`;
  return null;
}

/**
 * Allot a provisional seat. Runs inside one transaction with the registration insert; the seat is only taken
 * if it is still open (UPDATE ... WHERE state = 'open'), and seat.registration_id is UNIQUE, so two delegates can
 * never hold the same portfolio. If the seat was taken in between, the next candidate is tried in the same request.
 *
 * Order: each preferred committee in turn (the chosen portfolio first, then any portfolio the delegate's experience
 * qualifies for), then any other committee with a qualifying portfolio, then the waitlist.
 */
export function allocate(regId: string, o: { withFallback?: boolean; reason?: string; byUser?: string | null } = {}): AllocResult {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    if (one("SELECT 1 FROM seat WHERE registration_id = ?", regId)) throw conflict('Registration already holds a seat');
    const s = eventSettings(reg.event_id);
    const prefs = json<string[]>(reg.preferences, []);
    const chosen = json<Record<string, string>>(reg.portfolio_prefs, {});
    const points = experiencePoints(reg);
    const minimum = s.tierMinExperience;
    for (const c of committeesInOrder(reg.event_id, prefs, o.withFallback ?? true)) {
      for (const cand of candidateSeats(reg, c, s.maxPerInstitutionPerCommittee, { points, minimum, preferredPortfolio: chosen[c.id] ?? null })) {
        const res = run("UPDATE seat SET state = 'held', registration_id = ?, held_at = ? WHERE id = ? AND state = 'open'", regId, now(), cand.seat_id);
        if (Number(res.changes) !== 1) continue;
        const confirmed = reg.payment_status === 'paid';
        if (confirmed) run("UPDATE seat SET state = 'confirmed' WHERE id = ?", cand.seat_id);
        update('registration', regId, {
          allot_status: confirmed ? 'confirmed' : 'held', waitlist_position: null,
          hold_expires_at: confirmed ? null : addHours(now(), s.holdHours), updated_at: now(),
        });
        const firstChoice = prefs[0] ? chosen[prefs[0]] : null;
        const notes = [
          firstChoice && firstChoice !== cand.portfolio_id ? whyNotChosen(firstChoice, points, minimum) : null,
          c.fallback ? `Preferred committees full for this experience level; placed in ${c.short}` : null,
        ].filter(Boolean);
        history(regId, cand.seat_id, reg.allot_status === 'waitlisted' ? 'promoted' : 'held', o.byUser ?? null, o.reason ?? (notes.join('. ') || null));
        return { kind: 'seat', pick: { seatId: cand.seat_id, committeeId: c.id, committee: c.name, committeeShort: c.short, portfolio: cand.portfolio, tier: cand.tier, premiumPaise: cand.premium_paise, fallback: c.fallback } };
      }
    }
    const position = (one("SELECT MAX(waitlist_position) AS m FROM registration WHERE event_id = ? AND allot_status = 'waitlisted'", reg.event_id)?.m ?? 0) + 1;
    update('registration', regId, { allot_status: 'waitlisted', waitlist_position: position, hold_expires_at: null, updated_at: now() });
    if (reg.allot_status !== 'waitlisted') history(regId, null, 'waitlisted', o.byUser ?? null, `Waitlist position ${position}: no open portfolio for ${points} experience points`);
    return { kind: 'waitlist', position };
  });
}

export function history(regId: string, seatId: string | null, action: string, byUser: string | null, reason: string | null) {
  insert('allotment_history', { id: uid(), registration_id: regId, seat_id: seatId, action, by_user: byUser ?? ctx().userId ?? null, reason, at: now() });
}

export function seatOf(regId: string) {
  return one(`SELECT s.id AS seat_id, s.state, s.seat_no, p.id AS portfolio_id, p.name AS portfolio, p.tier, p.premium_paise, c.id AS committee_id, c.name AS committee, c.short, c.guide_url, c.kind
    FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE s.registration_id = ?`, regId);
}

export function confirmSeat(regId: string) {
  const seat = seatOf(regId);
  if (!seat) return null;
  run("UPDATE seat SET state = 'confirmed' WHERE id = ?", seat.seat_id);
  update('registration', regId, { allot_status: 'confirmed', hold_expires_at: null, updated_at: now() });
  history(regId, seat.seat_id, 'confirmed', null, 'Payment confirmed');
  return seat;
}

export function releaseSeat(regId: string, reason: string) {
  return tx(() => {
    const seat = seatOf(regId);
    if (!seat) return null;
    run("UPDATE seat SET state = 'open', registration_id = NULL, held_at = NULL WHERE id = ?", seat.seat_id);
    update('registration', regId, { allot_status: 'released', hold_expires_at: null, updated_at: now() });
    history(regId, seat.seat_id, 'released', null, reason);
    return seat;
  });
}

export function assertNotLocked(eventId: string) {
  const s = eventSettings(eventId);
  if (s.allocationLockAt && s.allocationLockAt <= now()) throw conflict(`Allocations were locked on ${s.allocationLockAt.slice(0, 10)}. Change the lock date in event settings first.`);
}

/** Move a delegate to a specific seat (manual allocation, swap, upgrade or downgrade). */
export function moveToSeat(regId: string, seatId: string, reason: string, actorRoles: string[] = []) {
  if (!reason?.trim()) throw bad('A reason is required for every manual allocation change');
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    assertNotLocked(reg.event_id);
    const target = one(`SELECT s.*, p.name AS portfolio, p.premium_paise, p.committee_id, c.event_id, c.name AS committee FROM seat s
        JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE s.id = ?`, seatId);
    if (!target || target.event_id !== reg.event_id) throw notFound('Seat');
    if (target.state !== 'open') throw conflict('That seat is already taken');
    const old = seatOf(regId);
    // Registration executives may only move within the same tier ("within rules"); admins can upgrade/downgrade.
    if (old && actorRoles.includes('registration_exec') && !actorRoles.some((r) => ['admin', 'superadmin'].includes(r))) {
      const t = one('SELECT tier FROM portfolio WHERE id = ?', target.portfolio_id)!;
      if (t.tier !== old.tier) throw conflict('Registration executives can only move delegates between portfolios of the same tier');
    }
    if (old) run("UPDATE seat SET state = 'open', registration_id = NULL, held_at = NULL WHERE id = ?", old.seat_id);
    const state = reg.payment_status === 'paid' || old?.state === 'confirmed' ? 'confirmed' : 'held';
    const r = run("UPDATE seat SET state = ?, registration_id = ?, held_at = ? WHERE id = ? AND state = 'open'", state, regId, now(), seatId);
    if (Number(r.changes) !== 1) throw conflict('That seat was just taken');
    const s = eventSettings(reg.event_id);
    update('registration', regId, {
      allot_status: state, waitlist_position: null, updated_at: now(),
      hold_expires_at: state === 'held' ? reg.hold_expires_at ?? addHours(now(), s.holdHours) : null,
    });
    history(regId, seatId, old ? 'swapped' : 'manual', ctx().userId ?? null, reason);
    audit('allotment.move', 'registration', regId, old ? { committee: old.committee, portfolio: old.portfolio } : null, { committee: target.committee, portfolio: target.portfolio, reason });
    return { old, target, premiumDelta: (target.premium_paise ?? 0) - (old?.premium_paise ?? 0) };
  });
}

/** Release a seat freed by expiry/cancellation and offer it down the waitlist. Returns promoted registration ids. */
export function promoteWaitlist(eventId: string): string[] {
  const promoted: string[] = [];
  const waiting = all("SELECT id, waitlist_position FROM registration WHERE event_id = ? AND allot_status = 'waitlisted' AND cancelled_at IS NULL ORDER BY waitlist_position", eventId);
  for (const w of waiting) {
    const free = one("SELECT COUNT(*) AS n FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE c.event_id = ? AND s.state = 'open'", eventId)?.n ?? 0;
    if (!free) break;
    tx(() => {
      const res = allocate(w.id, { withFallback: false, reason: 'Waitlist auto-promotion' });
      if (res.kind === 'seat') promoted.push(w.id);
      else update('registration', w.id, { waitlist_position: w.waitlist_position }); // keep their place in line
    });
  }
  // Re-number remaining waitlist so positions stay 1..n
  const left = all("SELECT id FROM registration WHERE event_id = ? AND allot_status = 'waitlisted' ORDER BY waitlist_position", eventId);
  left.forEach((r, i) => run('UPDATE registration SET waitlist_position = ? WHERE id = ?', i + 1, r.id));
  return promoted;
}

class DryRun extends Error { constructor(public results: any[]) { super('dry run'); } }

/** Allocation simulator: run the real engine against a test list inside a transaction that is always rolled back. */
export function simulate(eventId: string, people: { name?: string; institution?: string; experience?: string; mun_count?: number; preferences?: string[] }[]) {
  try {
    tx(() => {
      const results: any[] = [];
      for (const [i, p] of people.entries()) {
        const id = uid();
        insert('registration', {
          id, ref: `SIM-${i}-${id.slice(0, 6)}`, event_id: eventId, token: uid(), full_name: p.name ?? `Test delegate ${i + 1}`, email: `sim${i}@example.test`, mobile: '9000000000',
          institution: p.institution ?? `Test School ${i % 7}`, class_year: '12', city: 'Test', preferences: JSON.stringify(p.preferences ?? []),
          experience: p.experience ?? 'first', mun_count: Math.max(0, Math.floor(Number(p.mun_count ?? 0)) || 0), consent_at: now(), created_at: now(), updated_at: now(),
        });
        const r = allocate(id);
        results.push({ name: p.name ?? `Test delegate ${i + 1}`, institution: p.institution, experience: p.experience ?? 'first', ...(r.kind === 'seat' ? { committee: r.pick.committeeShort, portfolio: r.pick.portfolio, tier: r.pick.tier, fallback: r.pick.fallback } : { waitlist: r.position }) });
      }
      const fill = all(`SELECT c.short, c.name, COUNT(s.id) AS seats, SUM(s.state <> 'open') AS filled FROM committee c JOIN portfolio p ON p.committee_id = c.id JOIN seat s ON s.portfolio_id = p.id WHERE c.event_id = ? GROUP BY c.id ORDER BY c.sort`, eventId);
      throw new DryRun([{ results, fill }]);
    });
  } catch (e) {
    if (e instanceof DryRun) return e.results[0];
    throw e;
  }
}

export function inventory(eventId: string) {
  const committees = all('SELECT * FROM committee WHERE event_id = ? ORDER BY sort, name', eventId);
  const portfolios = all(`SELECT p.*, (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id) AS seats,
      (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id AND s.state = 'held') AS held,
      (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id AND s.state = 'confirmed') AS confirmed
    FROM portfolio p JOIN committee c ON c.id = p.committee_id WHERE c.event_id = ? ORDER BY p.sort, p.name`, eventId);
  return committees.map((c) => {
    const ps = portfolios.filter((p) => p.committee_id === c.id);
    const seats = ps.reduce((s, p) => s + p.seats, 0), held = ps.reduce((s, p) => s + p.held, 0), confirmed = ps.reduce((s, p) => s + p.confirmed, 0);
    return { ...c, portfolios: ps, seats, held, confirmed, open: seats - held - confirmed };
  });
}

export function addPortfolio(committeeId: string, p: { name: string; tier?: string; premiumPaise?: number; seats?: number; sort?: number }) {
  return tx(() => {
    const c = one('SELECT * FROM committee WHERE id = ?', committeeId);
    if (!c) throw notFound('Committee');
    const existing = one('SELECT * FROM portfolio WHERE committee_id = ? AND name = ?', committeeId, p.name.trim());
    const id = existing?.id ?? uid();
    if (!existing) insert('portfolio', { id, committee_id: committeeId, name: p.name.trim(), tier: p.tier ?? 'standard', premium_paise: p.premiumPaise ?? 0, sort: p.sort ?? 0 });
    else update('portfolio', id, { tier: p.tier ?? existing.tier, premium_paise: p.premiumPaise ?? existing.premium_paise });
    const want = p.seats ?? (c.kind === 'double' ? 2 : 1);
    const have = all('SELECT * FROM seat WHERE portfolio_id = ? ORDER BY seat_no', id);
    for (let n = have.length + 1; n <= want; n++) insert('seat', { id: uid(), portfolio_id: id, seat_no: n, state: 'open' });
    // Shrinking is only allowed for open seats; confirmed allotments are never overwritten.
    for (const s of have.slice(want).reverse()) {
      if (s.state !== 'open') throw conflict(`Cannot remove seat ${s.seat_no} of ${p.name}: it is allotted`);
      run('DELETE FROM seat WHERE id = ?', s.id);
    }
    return id;
  });
}
