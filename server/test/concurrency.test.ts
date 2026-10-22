import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { freshDb } from './helpers.ts';
import { all, one, run } from '../src/db.ts';

// Roadmap phase-1 gate: no double allotment under simultaneous registrations (separate OS processes, one DB).
test('8 processes × 25 simultaneous registrations never double-allot a seat', async () => {
  const ctx = freshDb();
  // Make allocation tight: one institution cap off, so everyone competes for the same seats.
  run("UPDATE event SET settings = json_set(settings, '$.maxPerInstitutionPerCommittee', 0) WHERE id = ?", ctx.eventId);
  const workers = Array.from({ length: 8 }, (_, w) => new Promise<any>((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', path.join(import.meta.dirname, 'concurrency-worker.ts'), ctx.file, ctx.eventId, ctx.committeeIds.UNSC, '25', String(w + 10)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (d) => (out += d));
    p.on('exit', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`worker exit ${code}`))));
  }));
  const results = await Promise.all(workers);
  const ok = results.reduce((s, r) => s + r.ok, 0);
  assert.equal(ok, 200, `all registrations saved (${JSON.stringify(results.map((r) => r.errors))})`);
  const regs = all("SELECT id, allot_status FROM registration WHERE full_name LIKE 'Load %'");
  const seated = all("SELECT s.registration_id FROM seat s JOIN registration r ON r.id = s.registration_id WHERE r.full_name LIKE 'Load %'");
  assert.equal(new Set(seated.map((s) => s.registration_id)).size, seated.length, 'no registration holds two seats');
  assert.equal(seated.length, regs.filter((r) => r.allot_status === 'held').length, 'every held registration has exactly one seat');
  assert.equal(seated.length + regs.filter((r) => r.allot_status === 'waitlisted').length, 200);
  const unsc = one("SELECT COUNT(*) AS n FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = ? AND s.state <> 'open'", ctx.committeeIds.UNSC)!.n;
  assert.equal(unsc, 15, 'the first-choice committee filled exactly to capacity');
  const positions = all("SELECT waitlist_position FROM registration WHERE allot_status = 'waitlisted' ORDER BY waitlist_position").map((r) => r.waitlist_position);
  assert.equal(new Set(positions).size, positions.length, 'waitlist positions are unique');
});
