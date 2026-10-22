import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.UPLOAD_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'dd-up-'));
process.env.JOBS = 'off';
process.env.OCR ??= 'off';
const { openDb, one, all } = await import('../src/db.ts');
const { seed } = await import('../src/seed.ts');
const { asSystem, ctxStore } = await import('../src/util.ts');

export function freshDb() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dd-db-')), 'test.db');
  openDb(file);
  const s = asSystem(() => seed())!;
  return { ...s, file };
}
export function user(email: string) {
  const u = one('SELECT * FROM user WHERE email = ?', email)!;
  const roles = all('SELECT role FROM user_role WHERE user_id = ?', u.id).map((r) => r.role);
  return { id: u.id, roles };
}
export function as<T>(email: string, fn: () => T): T {
  const u = user(email);
  return ctxStore.run({ userId: u.id, userLabel: email, ip: '127.0.0.1', roles: u.roles }, fn);
}
let n = 0;
export function person(over: Record<string, any> = {}) {
  n++;
  return { full_name: `Test Delegate ${n}`, email: `t${n}-${Date.now()}@example.com`, mobile: `9${String(100000000 + n * 7717 + Math.floor(Math.random() * 1000)).slice(0, 9)}`, institution: `School ${n % 4}`, class_year: '11', city: 'Pune', dob: '2006-01-01', preferences: [], consent: true, ...over };
}
