import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshDb, person } from './helpers.ts';
import { one } from '../src/db.ts';
import { asSystem } from '../src/util.ts';
import { ocrImage, parseProof, parseBill, stopOcr } from '../src/services/ocr.ts';
import { config } from '../src/config.ts';
config.ocrEnabled = true;
const { register } = await import('../src/services/registrations.ts');
const { submitEvidence, readProof } = await import('../src/services/evidence.ts');

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f));
after(() => stopOcr());

test('reads UTR, amount and date from a UPI screenshot', async () => {
  const p = parseProof(await ocrImage(fx('upi-receipt.png')), 212400);
  assert.equal(p.utr, '432110000003');
  assert.equal(p.amountPaise, 212400);
  assert.equal(p.date, '2026-10-21');
});

test('reads GSTIN, invoice number, date and totals from a bill', async () => {
  const b = parseBill(await ocrImage(fx('bill.png')));
  assert.equal(b.gstin, '29ABCDE1234F1Z5');
  assert.equal(b.invoiceNo, 'SPH/1042');
  assert.equal(b.date, '2026-10-18');
  assert.equal(b.totalPaise, 531000);
  assert.equal(b.gstPaise, 81000);
});

test('a typed UTR that differs from the screenshot is flagged for the CFO', async () => {
  freshDb();
  const ev = one('SELECT id FROM event')!;
  const { registration: r } = asSystem(() => register(ev.id, person()));
  const sub = asSystem(() => submitEvidence(r, { buffer: fx('upi-receipt.png') }, { utr: '999988887777', amountPaise: r.total_paise, paidOn: '2026-10-21' }));
  await asSystem(() => readProof(sub.id));
  const flags = JSON.parse(one('SELECT tamper_flags FROM payment_evidence WHERE id = ?', sub.id)!.tamper_flags);
  assert.ok(flags.some((f: string) => /Screenshot shows UTR 432110000003/.test(f)), JSON.stringify(flags));
});
