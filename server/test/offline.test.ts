import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { freshDb, person } from './helpers.ts';
import { asSystem } from '../src/util.ts';

const { register } = await import('../src/services/registrations.ts');
const { offlineCopy } = await import('../src/services/offline.ts');

test('the offline copy is an Excel file with delegates, seats, payments and applications', async () => {
  const ctx = freshDb();
  asSystem(() => register(ctx.eventId, person({ full_name: 'Offline Delegate', preferences: [ctx.committeeIds.DISEC], mun_count: 2 })));
  const { name, file } = await offlineCopy(ctx.eventId);
  assert.match(name, /^BGYS27-offline-copy-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(file as any);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['About', 'Delegates', 'Committees & seats', 'Payments', 'Applications']);
  const del = wb.getWorksheet('Delegates')!;
  const names = del.getColumn(2).values as any[];
  assert.ok(names.includes('Offline Delegate'));
  const row = del.getRow(names.indexOf('Offline Delegate'));
  assert.equal(row.getCell(8).value, 'UNGA First Committee (DISEC)');
  assert.ok(wb.getWorksheet('Committees & seats')!.rowCount > 10);
});
