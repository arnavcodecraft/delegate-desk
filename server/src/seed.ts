/**
 * Seeds an organisation, a demo MUN event with committees and portfolios, fee plans, referrers, commission plans
 * and staff users. With --demo it also creates sample registrations, payments, proofs and expenses.
 *   npm run seed            # base setup
 *   npm run seed -- --demo  # plus sample activity
 */
import { settleProofReads } from './services/evidence.ts';
import { migrateLegacyPaymentDetails } from './services/conference.ts';
import { stopOcr } from './services/ocr.ts';
import { openDb, one, insert, all, run } from './db.ts';
import { seedChart } from './services/ledger.ts';
import { seedTemplates } from './services/notify.ts';
import { addPortfolio } from './services/allocation.ts';
import { createUser } from './auth.ts';
import { asSystem, ctxStore, now, uid, token, normalizeName, istDate, addDays } from './util.ts';
import { config } from './config.ts';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import { saveEventSettings } from './settings.ts';

const PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe!2026';

const COMMITTEES: { short: string; name: string; kind?: 'double'; portfolios: [string, 'high' | 'standard' | 'low', number?][] ; guide?: string }[] = [
  { short: 'UNSC', name: 'United Nations Security Council', portfolios: [['United States', 'high', 30000], ['China', 'high', 30000], ['Russian Federation', 'high', 30000], ['United Kingdom', 'high', 30000], ['France', 'high', 30000], ['India', 'standard'], ['Japan', 'standard'], ['Brazil', 'standard'], ['Germany', 'standard'], ['South Africa', 'standard'], ['Indonesia', 'low'], ['Mexico', 'low'], ['Nigeria', 'low'], ['Egypt', 'low'], ['Norway', 'low']] },
  { short: 'DISEC', name: 'UNGA First Committee (DISEC)', kind: 'double', portfolios: [['United States', 'high'], ['China', 'high'], ['Russian Federation', 'high'], ['India', 'high'], ['Pakistan', 'standard'], ['Israel', 'standard'], ['Iran', 'standard'], ['North Korea', 'standard'], ['South Korea', 'standard'], ['Japan', 'standard'], ['Ukraine', 'standard'], ['Turkey', 'low'], ['Saudi Arabia', 'low'], ['Australia', 'low'], ['Canada', 'low']] },
  { short: 'UNHRC', name: 'UN Human Rights Council', portfolios: [['United States', 'high'], ['China', 'high'], ['India', 'high'], ['Sudan', 'standard'], ['Venezuela', 'standard'], ['Qatar', 'standard'], ['Bangladesh', 'standard'], ['Argentina', 'standard'], ['Finland', 'low'], ['Malawi', 'low'], ['Chile', 'low'], ['Vietnam', 'low']] },
  { short: 'LS', name: 'Lok Sabha', portfolios: [['Prime Minister', 'high', 30000], ['Leader of the Opposition', 'high', 30000], ['Minister of Finance', 'high'], ['Minister of Home Affairs', 'high'], ['Minister of External Affairs', 'standard'], ['MP, Wayanad', 'standard'], ['MP, Varanasi', 'standard'], ['MP, Kolkata Dakshin', 'standard'], ['MP, Hyderabad', 'standard'], ['MP, Baramati', 'standard'], ['MP, Amethi', 'low'], ['MP, Chennai Central', 'low'], ['MP, Patiala', 'low'], ['MP, Shillong', 'low']] },
  { short: 'IPC', name: 'International Press Corps', portfolios: [['Reuters – Journalist', 'standard'], ['Al Jazeera – Journalist', 'standard'], ['The Hindu – Journalist', 'standard'], ['BBC – Photographer', 'low'], ['NDTV – Caricaturist', 'low'], ['Associated Press – Journalist', 'standard']] },
];

export function seed() {
  if (one('SELECT 1 FROM organization')) { console.log('Already seeded. Delete the database file to start over.'); return null; }
  seedChart(); seedTemplates();
  const orgId = uid();
  insert('organization', {
    id: orgId, name: 'DelegateDesk Demo Org', legal_name: 'Demo Conferences Private Limited', entity_type: 'private_limited',
    pan: 'AABCD1234E', gstin: '29AABCD1234E1Z5', state_code: '29', address: '12 MG Road, Bengaluru 560001',
    upi_id: 'democonferences@upi', bank_name: 'Demo Bank', bank_account: '000123456789', bank_ifsc: 'DEMO0001234',
    grievance_contact: 'Grievance Officer, grievance@example.org, +91 80 0000 0000', settings: '{}', created_at: now(),
  });
  const eventId = uid();
  insert('event', { id: eventId, org_id: orgId, code: 'BGYS27', name: 'Bengaluru Global Youth Summit 2027', kind: 'mun', venue: 'Bengaluru International Centre', city: 'Bengaluru', state_code: '29', start_date: '2027-01-15', end_date: '2027-01-17', status: 'open', settings: '{}', created_at: now() });
  const liveGateway = config.razorpay.keyId ? 'razorpay' : config.cashfree.appId ? 'cashfree' : 'mock';
  saveEventSettings(eventId, { defaultGateway: liveGateway as any, detailsLockAt: '2027-01-10T18:30:00.000Z', allocationLockAt: '2027-01-12T18:30:00.000Z' });

  const tiers: [string, string, number, string | null, string | null, number][] = [
    ['school', 'Early bird', 180000, null, '2026-11-15T18:29:59.000Z', 1],
    ['school', 'Regular', 200000, null, '2026-12-20T18:29:59.000Z', 2], // also the fallback once early-bird seats run out
    ['school', 'Late', 240000, '2026-12-20T18:30:00.000Z', null, 3],
    ['college', 'Regular', 220000, null, null, 1],
    ['international', 'Regular', 400000, null, null, 1],
    ['advisor', 'Faculty advisor', 100000, null, null, 1],
  ];
  for (const [category, name, amount, starts, ends, sort] of tiers) insert('fee_tier', { id: uid(), event_id: eventId, category, name, amount_paise: amount, starts_at: starts, ends_at: ends, quota: name === 'Early bird' ? 150 : null, sort });
  insert('coupon', { id: uid(), event_id: eventId, code: 'EARLY10', kind: 'percent', value: 1000, purpose: 'coupon', expires_at: '2026-12-31T18:29:59.000Z', max_uses: 100 });
  insert('coupon', { id: uid(), event_id: eventId, code: 'FRIEND200', kind: 'flat', value: 20000, purpose: 'referral', max_uses: 300 });

  const committeeIds: Record<string, string> = {};
  COMMITTEES.forEach((c, i) => {
    const id = uid(); committeeIds[c.short] = id;
    insert('committee', { id, event_id: eventId, name: c.name, short: c.short, kind: c.kind ?? 'single', description: null, guide_url: `https://example.org/guides/${c.short.toLowerCase()}.pdf`, sort: i });
    c.portfolios.forEach(([name, tier, premium], j) => addPortfolio(id, { name, tier, premiumPaise: premium ?? 0, sort: j }));
  });

  const planDefault = uid();
  const tiersJson = JSON.stringify([{ from: 1, to: 10, rate_bp: 500 }, { from: 11, to: 25, rate_bp: 700 }, { from: 26, to: null, rate_bp: 1000 }]);
  insert('commission_plan', { id: planDefault, org_id: orgId, name: 'Ambassador – progressive', method: 'progressive', basis: 'count', base: 'after_discount', tiers: tiersJson, period: 'event', min_payout_paise: 50000, referrer_kind: null, created_at: now() });
  insert('commission_plan', { id: uid(), org_id: orgId, name: 'Schools – slab', method: 'slab', basis: 'count', base: 'after_discount', tiers: tiersJson, period: 'event', min_payout_paise: 0, referrer_kind: 'school', created_at: now() });
  insert('commission_plan', { id: uid(), org_id: orgId, name: 'Partners – flat ₹150 per delegate', method: 'flat_amount', basis: 'count', base: 'excl_gst', tiers: JSON.stringify([{ from: 1, to: null, amount_paise: 15000 }]), period: 'event', min_payout_paise: 0, referrer_kind: 'partner', created_at: now() });

  const refs: [string, string, string | null, string | null, string | null][] = [
    ['Riya Kapoor', 'ambassador', 'riya.kapoor@example.org', '9810000001', 'ABCPK1234A'],
    ['Arjun Mehta', 'individual', 'arjun.mehta@example.org', '9810000002', null],
    ['Delhi Public School RK Puram', 'school', 'mun@dpsrkp.example.org', null, 'AAATD1111B'],
    ['Model UN India Society', 'partner', 'hello@munis.example.org', null, 'AAAAM2222C'],
  ];
  for (const [name, kind, email, mobile, pan] of refs) insert('referrer', { id: uid(), org_id: orgId, name, normalized: normalizeName(name), kind, email, mobile, pan, bank_account: pan ? '1234567890' : null, bank_ifsc: pan ? 'HDFC0000123' : null, token: token(18), created_at: now() });

  const users: [string, string, any[]][] = [
    ['Secretary-General', 'admin@example.org', [{ role: 'admin' }]],
    ['Chief Financial Officer', 'cfo@example.org', [{ role: 'cfo' }]],
    ['Deputy CFO (second approver)', 'cfo2@example.org', [{ role: 'cfo' }]],
    ['Accountant', 'accounts@example.org', [{ role: 'accountant' }]],
    ['Registration Desk', 'desk@example.org', [{ role: 'registration_exec' }]],
    ['UNSC Director', 'chair.unsc@example.org', [{ role: 'chair', committee_id: committeeIds.UNSC, event_id: eventId }]],
    ['Statutory Auditor', 'auditor@example.org', [{ role: 'auditor' }]],
  ];
  for (const [name, email, roles] of users) createUser({ name, email, password: PASSWORD, roles });
  // The public profile: Explore, the conference page and the Job Board.
  saveEventSettings(eventId, {
    profile: {
      acronym: 'BGYS', format: 'in_person', level: 'both', country: 'in', expected: 240,
      description: 'Three days of debate at the Bengaluru International Centre: five committees from the Security Council to the Lok Sabha, a press corps, and socials every evening. First-time delegates get a training session on Day 1.',
      socials: { instagram: '@bgys.mun', facebook: '', tiktok: '', whatsapp: '', website: 'bgys.example.org' },
      logo: null, banner: 'p2', datesTbd: false, contactEmail: 'secretariat@example.org', uses: ['applications', 'payments', 'committees', 'emails'],
    },
    roles: { delegate: true, advisor: true, observer: true, chair: true },
    positionPapers: { enabled: true, deadline: '2027-01-10T18:29:59.000Z' },
  });
  const details: Record<string, [string, string, string[], string]> = {
    UNSC: ['mun', 'shield', ['Maritime security in the Red Sea'], 'advanced'], DISEC: ['mun', 'shield', ['Lethal autonomous weapons systems'], 'intermediate'],
    UNHRC: ['mun', 'heart-handshake', ['Digital surveillance and the right to privacy'], 'beginner'], LS: ['custom', 'landmark', ['The One Nation, One Election Bill'], 'intermediate'],
    IPC: ['press', 'newspaper', [], 'beginner'],
  };
  const codes: Record<string, string> = { 'United States': 'us', China: 'cn', 'Russian Federation': 'ru', 'United Kingdom': 'gb', France: 'fr', India: 'in', Japan: 'jp', Brazil: 'br', Germany: 'de', 'South Africa': 'za',
    Indonesia: 'id', Mexico: 'mx', Nigeria: 'ng', Egypt: 'eg', Norway: 'no', Pakistan: 'pk', Israel: 'il', Iran: 'ir', 'North Korea': 'kp', 'South Korea': 'kr', Ukraine: 'ua', Turkey: 'tr',
    'Saudi Arabia': 'sa', Australia: 'au', Canada: 'ca', Sudan: 'sd', Venezuela: 've', Qatar: 'qa', Bangladesh: 'bd', Argentina: 'ar', Finland: 'fi', Malawi: 'mw', Chile: 'cl', Vietnam: 'vn' };
  for (const [short, [type, emblem, topics, difficulty]] of Object.entries(details)) run('UPDATE committee SET type = ?, emblem = ?, topics = ?, difficulty = ? WHERE id = ?', type, emblem, JSON.stringify(topics), difficulty, committeeIds[short]);
  for (const [name, code] of Object.entries(codes)) run('UPDATE portfolio SET code = ? WHERE name = ? AND committee_id IN (SELECT id FROM committee WHERE event_id = ?)', code, name, eventId);
  insert('position', { id: uid(), event_id: eventId, kind: 'chair', title: 'Vice-Chair, UNHRC', committee_id: committeeIds.UNHRC, description: 'Help run the Human Rights Council with the Director. At least two conferences as a delegate or chair.', openings: 1, deadline: '2026-12-20T18:29:59.000Z', open: 1, sort: 0, created_at: now() });
  insert('position', { id: uid(), event_id: eventId, kind: 'press', title: 'Head of Press, IPC', committee_id: committeeIds.IPC, description: 'Lead the International Press Corps: assign stories, edit the daily newsletter.', openings: 1, deadline: null, open: 1, sort: 1, created_at: now() });
  insert('position', { id: uid(), event_id: eventId, kind: 'volunteer', title: 'Logistics volunteer', committee_id: null, description: 'Registration desk, committee rooms and the socials. Certificates for all volunteers.', openings: 12, deadline: null, open: 1, sort: 2, created_at: now() });
  migrateLegacyPaymentDetails();   // UPI + bank transfer as the demo's payment methods
  insert('executive_board', { id: uid(), event_id: eventId, committee_id: committeeIds.UNSC, name: 'Ananya Rao', position: 'Director', email: 'chair.unsc@example.org', phone: '9800000011' });
  insert('executive_board', { id: uid(), event_id: eventId, committee_id: committeeIds.UNSC, name: 'Kabir Singh', position: 'Vice-Director', email: 'kabir@example.org', phone: '9800000012' });
  return { orgId, eventId, committeeIds };
}

async function demo(eventId: string) {
  const { register } = await import('./services/registrations.ts');
  const { createOrder, sandboxComplete } = await import('./services/payments.ts');
  const { submitEvidence } = await import('./services/evidence.ts');
  const { createExpense, approveExpense, setBudget, upsertVendor } = await import('./services/expenses.ts');
  const cfo = one("SELECT id FROM user WHERE email = 'cfo@example.org'")!;
  const acct = one("SELECT id FROM user WHERE email = 'accounts@example.org'")!;
  const committees = all('SELECT id FROM committee WHERE event_id = ?', eventId).map((c) => c.id);
  const first = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Ishaan', 'Saanvi', 'Reyansh', 'Aadhya', 'Kabir', 'Myra', 'Arnav', 'Kiara', 'Advait', 'Anika', 'Vivaan', 'Navya', 'Rohan', 'Tara', 'Dhruv', 'Meera'];
  const last = ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Gupta', 'Banerjee', 'Khan', 'Patel', 'Menon', 'Das'];
  const schools = ['Delhi Public School RK Puram', 'Bishop Cotton Boys School', 'National Public School Indiranagar', 'The Doon School', 'Mallya Aditi International School', 'St. Xavier’s College Mumbai', 'Christ University'];
  const referrals = ['Riya Kapoor', 'riya kapur', 'Arjun Mehta', 'Delhi Public School RK Puram', '', '', 'Mr. Arjun Mehta', 'Rhea K', ''];
  let evidenceCount = 0;
  for (let i = 0; i < 45; i++) {
    const name = `${first[i % first.length]} ${last[(i * 7) % last.length]}`;
    const school = schools[i % schools.length];
    try {
      const { registration: r, allocation } = register(eventId, {
        full_name: name, email: `delegate${i + 1}@example.com`, mobile: `98${String(10000000 + i * 7919).slice(0, 8)}`, institution: school,
        class_year: school.includes('College') || school.includes('University') ? 'UG 2nd year' : ['10', '11', '12'][i % 3], city: i % 3 ? 'Bengaluru' : 'Delhi',
        dob: i % 6 === 0 ? '2009-05-14' : '2007-08-21', guardian_name: 'Parent', guardian_email: `parent${i + 1}@example.com`,
        preferences: i % 9 === 0 ? [] : [...committees].sort(() => Math.random() - 0.5).slice(0, 3), referral_name: referrals[i % referrals.length],
        experience: ['first', 'some', 'experienced'][i % 3], consent: true,
      });
      if (allocation.kind !== 'seat') continue;
      if (i % 5 < 3) {
        const o = await createOrder({ registrationIds: [r.id], gateway: 'mock' });
        sandboxComplete(o.orderId, 'success');
      } else if (i % 5 === 3) {
        // The first two proofs use a real-looking receipt so screenshot reading has something to show:
        // one whose typed details match it, one where the delegate typed a different UTR.
        const proofNo = evidenceCount++;
        const utr = proofNo === 0 ? '432110000003' : `4321${String(10000000 + i).slice(0, 8)}`;
        const png = proofNo < 2 ? readFileSync(new URL('../assets/demo-receipt.png', import.meta.url))
          : await QRCode.toBuffer(`Demo UPI receipt ${r.ref} UTR ${utr} amount ${r.total_paise / 100}`, { width: 360 });
        submitEvidence(one('SELECT * FROM registration WHERE id = ?', r.id)!, { buffer: png }, { utr, amountPaise: r.total_paise, paidOn: proofNo < 2 ? '2026-10-21' : istDate() });
      }
    } catch (e: any) { console.warn('demo registration skipped:', e.message); }
  }
  const venue = upsertVendor({ name: 'Bengaluru International Centre', gstin: '29AAACB9999K1Z2', pan: 'AAACB9999K' });
  const caterer = upsertVendor({ name: 'Annapoorna Caterers', gstin: '29AAFCA8888L1Z1', pan: 'AAFCA8888L' });
  const printer = upsertVendor({ name: 'Sharp Print House' });
  for (const [cat, amt] of [['venue', 15000000], ['catering', 9000000], ['printing', 2000000], ['awards', 1500000], ['marketing', 2500000]] as const) setBudget(eventId, cat, amt, cat === 'printing');
  const asUser = (id: string, roles: string[], fn: () => void) => ctxStore.run({ userId: id, userLabel: id, ip: 'seed', roles }, fn);
  let venueExp = '', cateringExp = '';
  asUser(acct.id, ['accountant'], () => {
    venueExp = createExpense({ event_id: eventId, category: 'venue', cost_behaviour: 'fixed', description: 'Hall hire, 3 days', vendor_id: venue, invoice_no: 'BIC/2026/881', bill_date: istDate(addDays(new Date(), -5)), amount_paise: 12000000, gst_rate_bp: 1800, itc_eligible: true }).id;
    cateringExp = createExpense({ event_id: eventId, category: 'catering', cost_behaviour: 'variable', description: 'Lunch and tea, advance', vendor_id: caterer, invoice_no: 'AC-441', bill_date: istDate(addDays(new Date(), -2)), amount_paise: 1500000, gst_rate_bp: 500, itc_eligible: false, tds_section: '194C', tds_rate_bp: 200 }).id;
    createExpense({ event_id: eventId, category: 'printing', cost_behaviour: 'variable', description: 'Placards and badges', vendor_id: printer, bill_date: istDate(), amount_paise: 450000, gst_rate_bp: 1800, itc_eligible: true });
  });
  asUser(cfo.id, ['cfo'], () => { approveExpense(venueExp); approveExpense(cateringExp); });
}

if (/[\\/]seed\.ts$/.test(process.argv[1] ?? '')) {
  openDb();
  const res = asSystem(() => seed());
  if (res && process.argv.includes('--demo')) await asSystem(() => demo(res.eventId));
  await settleProofReads();
  await stopOcr();
  if (res) {
    console.log(`\nSeeded. Staff sign in at ${config.baseUrl}/login with password: ${PASSWORD}`);
    console.log('  admin@example.org (Secretary-General)   cfo@example.org / cfo2@example.org (CFO)   accounts@example.org (Accountant)');
    console.log('  desk@example.org (Registration exec)     chair.unsc@example.org (UNSC chair)       auditor@example.org (Auditor)');
    console.log('Admin, CFO and Accountant must set up two-factor authentication on first sign-in.');
    console.log(`Public registration form: ${config.baseUrl}/register/BGYS27\n`);
  }
}
