import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { freshDb, person } from './helpers.ts';
import { one } from '../src/db.ts';
import { asSystem } from '../src/util.ts';
import { config } from '../src/config.ts';
import { createBackup, verifyBackup, restoreTo, seal, unseal } from '../src/services/backup.ts';
const { register } = await import('../src/services/registrations.ts');

config.backup.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-bk-'));
config.backup.key = 'a'.repeat(64);

test('backup is encrypted, restore-tested, and restores the database and uploads', () => {
  const ctx = freshDb();
  asSystem(() => register(ctx.eventId, person({ full_name: 'Backup Person' })));
  fs.mkdirSync(path.join(config.uploadDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, 'evidence', 'proof.png'), 'proof-bytes');
  const b = asSystem(() => createBackup());
  const raw = fs.readFileSync(path.join(config.backup.dir, b.file));
  assert.equal(raw.subarray(0, 5).toString(), 'DDBK1');
  assert.ok(!raw.includes(Buffer.from('Backup Person')), 'contents are not readable without the key');
  assert.match(asSystem(() => verifyBackup(b.id)), /^ok: integrity ok/);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-rs-'));
  const m = restoreTo(path.join(config.backup.dir, b.file), target);
  assert.ok(m.files.length >= 1);
  const db = new DatabaseSync(path.join(target, 'delegatedesk.db'), { readOnly: true });
  assert.equal((db.prepare("SELECT full_name FROM registration WHERE full_name = 'Backup Person'").get() as any).full_name, 'Backup Person');
  db.close();
  assert.equal(fs.readFileSync(path.join(target, 'uploads', 'evidence', 'proof.png'), 'utf8'), 'proof-bytes');
});

test('a wrong key or tampered file fails the restore drill', () => {
  const sealed = seal(Buffer.from('hello'));
  assert.throws(() => unseal(sealed, Buffer.alloc(32, 1)));
  const b = asSystem(() => createBackup());
  const f = path.join(config.backup.dir, b.file);
  const buf = fs.readFileSync(f); buf[buf.length - 10] ^= 0xff; fs.writeFileSync(f, buf);
  assert.match(asSystem(() => verifyBackup(b.id)), /^failed/);
  assert.match(one('SELECT verify_result FROM backup_log WHERE id = ?', b.id)!.verify_result, /^failed/);
});
