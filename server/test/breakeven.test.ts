import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakEven } from '../src/services/dashboard.ts';

// Spec §12: fixed ₹3,00,000, net price ₹2,000, variable ₹350 → contribution ₹1,650, break-even 182 (181.8 rounded up),
// and at 150 paid registrations a loss of ₹52,500.
test('break-even worked example', () => {
  const r = breakEven(30000000, 0, [{ category: 'school', share: 1, pricePaise: 200000, variablePaise: 35000 }], 150);
  assert.equal(r.contributionPaise, 165000);
  assert.equal(r.breakEvenCount, 182);
  assert.equal(r.gap, 32);
  assert.equal(r.resultAtCurrentPaise, -5250000);
});
test('mix-weighted contribution and sponsorship', () => {
  const r = breakEven(30000000, 6000000, [
    { category: 'school', share: 0.75, pricePaise: 200000, variablePaise: 35000 },
    { category: 'college', share: 0.25, pricePaise: 220000, variablePaise: 35000 },
  ], 0);
  assert.equal(r.contributionPaise, 170000);
  assert.equal(r.breakEvenCount, Math.ceil(24000000 / 170000));
});
