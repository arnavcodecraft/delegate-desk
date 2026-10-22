import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/services/commission.ts';

// Spec §14 worked example: ₹2,000 net fee, slabs 1–10 5%, 11–25 7%, 26+ 10%, 30 paid registrations.
const tiers = [{ from: 1, to: 10, rate_bp: 500 }, { from: 11, to: 25, rate_bp: 700 }, { from: 26, to: null, rate_bp: 1000 }];
const fee = 200000;
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

test('slab method: 30 registrations pay 10% on everything = ₹6,000', () => {
  assert.equal(sum(calculate({ method: 'slab', basis: 'count', tiers }, Array(30).fill(fee))), 600000);
});
test('progressive method: ₹1,000 + ₹2,100 + ₹1,000 = ₹4,100', () => {
  const lines = calculate({ method: 'progressive', basis: 'count', tiers }, Array(30).fill(fee));
  assert.equal(sum(lines.slice(0, 10)), 100000);
  assert.equal(sum(lines.slice(10, 25)), 210000);
  assert.equal(sum(lines.slice(25)), 100000);
  assert.equal(sum(lines), 410000);
});
test('the slab cliff: 25 → ₹3,500, 26 → ₹5,200; progressive 25 → ₹3,100, 26 → ₹3,300', () => {
  assert.equal(sum(calculate({ method: 'slab', basis: 'count', tiers }, Array(25).fill(fee))), 350000);
  assert.equal(sum(calculate({ method: 'slab', basis: 'count', tiers }, Array(26).fill(fee))), 520000);
  assert.equal(sum(calculate({ method: 'progressive', basis: 'count', tiers }, Array(25).fill(fee))), 310000);
  assert.equal(sum(calculate({ method: 'progressive', basis: 'count', tiers }, Array(26).fill(fee))), 330000);
});
test('value basis progressive (Cyntexa example): 30,000 of sales at 2% then 4% = 1,000', () => {
  const lines = calculate({ method: 'progressive', basis: 'value', tiers: [{ from: 0, to: 1000000, rate_bp: 200 }, { from: 1000000, to: null, rate_bp: 400 }] }, [3000000]);
  assert.equal(sum(lines), 100000);
});
test('cap limits the total per referrer', () => {
  assert.equal(sum(calculate({ method: 'slab', basis: 'count', tiers, cap_paise: 500000 }, Array(30).fill(fee))), 500000);
});
test('flat amount per delegate', () => {
  assert.equal(sum(calculate({ method: 'flat_amount', basis: 'count', tiers: [{ from: 1, to: null, amount_paise: 15000 }] }, [fee, fee, fee])), 45000);
});
