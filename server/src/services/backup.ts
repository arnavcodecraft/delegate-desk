import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { all, getDb, insert, one, run, scalar } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { ctx, notFound, now, uid } from '../util.ts';

/*
 * Encrypted backups: a consistent copy of the database (VACUUM INTO) plus every uploaded file, gzipped and sealed
 * with AES-256-GCM. Each backup is then restore-tested: decrypted, opened, integrity-checked and its row counts
 * compared with the live counts taken at backup time.
 */
const MAGIC = Buffer.from('DDBK1');
const COUNTED = ['registration', 'journal_entry', 'journal_line', 'invoice', 'audit_log', 'payment_transaction', 'expense', 'payout'];

export function backupKey(): Buffer {
  const k = config.backup.key;
  if (k) {
    const b = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, 'hex') : Buffer.from(k, 'base64');
    if (b.length === 32) return b;
  }
  // Fallback for development only: derived from APP_SECRET. Production should set BACKUP_KEY (32 random bytes).
  return crypto.scryptSync(config.appSecret, 'delegatedesk-backup', 32);
}

function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]));
}

export function seal(plain: Buffer, key = backupKey()) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(plain)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function unseal(sealed: Buffer, key = backupKey()) {
  if (!sealed.subarray(0, 5).equals(MAGIC)) throw new Error('Not a DelegateDesk backup file');
  const iv = sealed.subarray(5, 17), tag = sealed.subarray(17, 33);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([d.update(sealed.subarray(33)), d.final()]));
}

/** Archive layout: 4-byte manifest length, JSON manifest {counts, files:[{path,size}]}, database bytes, then each file. */
function pack(dbBytes: Buffer, files: { rel: string; data: Buffer }[], counts: Record<string, number>) {
  const manifest = Buffer.from(JSON.stringify({ version: 1, createdAt: now(), counts, dbSize: dbBytes.length, files: files.map((f) => ({ path: f.rel, size: f.data.length })) }));
  const len = Buffer.alloc(4); len.writeUInt32BE(manifest.length);
  return Buffer.concat([len, manifest, dbBytes, ...files.map((f) => f.data)]);
}
export function unpack(buf: Buffer) {
  const mlen = buf.readUInt32BE(0);
  const manifest = JSON.parse(buf.subarray(4, 4 + mlen).toString());
  let off = 4 + mlen;
  const db = buf.subarray(off, off + manifest.dbSize); off += manifest.dbSize;
  const files = manifest.files.map((f: { path: string; size: number }) => { const data = buf.subarray(off, off + f.size); off += f.size; return { rel: f.path, data }; });
  return { manifest, db, files };
}

export function liveCounts() {
  return Object.fromEntries(COUNTED.map((t) => [t, scalar<number>(`SELECT COUNT(*) FROM ${t}`) ?? 0]));
}

export function createBackup() {
  fs.mkdirSync(config.backup.dir, { recursive: true });
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ddbk-')), 'db.sqlite');
  const counts = liveCounts();
  getDb().exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const files = walk(config.uploadDir).map((rel) => ({ rel, data: fs.readFileSync(path.join(config.uploadDir, rel)) }));
  const sealed = seal(pack(fs.readFileSync(tmp), files, counts));
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  const name = `delegatedesk-${now().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')}.ddbak`;
  fs.writeFileSync(path.join(config.backup.dir, name), sealed, { mode: 0o600 });
  const id = uid();
  insert('backup_log', { id, file: name, size: sealed.length, counts: JSON.stringify(counts), created_at: now(), created_by: ctx().userId ?? 'system' });
  audit('backup.create', 'backup', id, undefined, { file: name, size: sealed.length, files: files.length });
  prune();
  return { id, file: name };
}

/** Restore drill: decrypt, open the copy, run integrity_check and compare counts. Never touches the live database. */
export function verifyBackup(id: string) {
  const b = one('SELECT * FROM backup_log WHERE id = ?', id);
  if (!b) throw notFound('Backup');
  let result: string;
  try {
    const { manifest, db, files } = unpack(unseal(fs.readFileSync(path.join(config.backup.dir, b.file))));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddrs-'));
    const file = path.join(dir, 'restore.sqlite');
    fs.writeFileSync(file, db);
    const copy = new DatabaseSync(file, { readOnly: true });
    const integrity = (copy.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;
    const counts = Object.fromEntries(COUNTED.map((t) => [t, (copy.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n]));
    copy.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const expected = JSON.parse(b.counts);
    const diffs = COUNTED.filter((t) => counts[t] !== expected[t]).map((t) => `${t} ${counts[t]} vs ${expected[t]}`);
    const filesOk = files.length === manifest.files.length;
    result = integrity === 'ok' && !diffs.length && filesOk ? `ok: integrity ok, ${files.length} files, counts match` : `failed: integrity ${integrity}${diffs.length ? `, counts differ (${diffs.join(', ')})` : ''}`;
  } catch (e: any) {
    result = `failed: ${e.message}`;
  }
  run('UPDATE backup_log SET verified_at = ?, verify_result = ? WHERE id = ?', now(), result, id);
  audit('backup.verify', 'backup', id, undefined, { result });
  return result;
}

/** Restore a backup into a target directory (database file + uploads). Used by `npm run restore`. */
export function restoreTo(backupFile: string, targetDir: string, key = backupKey()) {
  const { manifest, db, files } = unpack(unseal(fs.readFileSync(backupFile), key));
  fs.mkdirSync(path.join(targetDir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'delegatedesk.db'), db);
  for (const f of files) {
    const out = path.join(targetDir, 'uploads', f.rel);
    if (!out.startsWith(path.join(targetDir, 'uploads'))) continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, f.data);
  }
  return manifest;
}

function prune() {
  const keep = all('SELECT * FROM backup_log ORDER BY created_at DESC');
  for (const b of keep.slice(config.backup.keep)) {
    fs.rmSync(path.join(config.backup.dir, b.file), { force: true });
    run("UPDATE backup_log SET verify_result = 'pruned' WHERE id = ?", b.id);
  }
}

export function backupFilePath(id: string) {
  const b = one('SELECT * FROM backup_log WHERE id = ?', id);
  if (!b) throw notFound('Backup');
  return path.join(config.backup.dir, b.file);
}

/** Daily job: one backup per day, verified straight away. */
export function dailyBackup() {
  if (!config.backup.enabled) return null;
  const last = one('SELECT created_at FROM backup_log ORDER BY created_at DESC LIMIT 1');
  if (last && Date.now() - new Date(last.created_at).getTime() < 23.5 * 3600_000) return null;
  const b = createBackup();
  verifyBackup(b.id);
  return b;
}
