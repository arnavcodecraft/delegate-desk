import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type Row = any;
type Params = any[];

let db: DatabaseSync;
let depth = 0;

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8'));
  migrate();
  return db;
}

/** Columns added after the first release, applied to every database at startup (each ALTER runs once). */
const COLUMNS: [table: string, column: string, ddl: string][] = [
  ['template', 'provider_template', 'TEXT'],
  ['template', 'language', "TEXT NOT NULL DEFAULT 'en'"],
  ['template', 'params', "TEXT NOT NULL DEFAULT '[]'"],
  ['notification', 'vars', "TEXT NOT NULL DEFAULT '{}'"],
  ['notification', 'provider_message_id', 'TEXT'],
  ['notification', 'delivery_status', 'TEXT'],
  ['expense', 'is_po', 'INTEGER NOT NULL DEFAULT 0'],
];
function migrate() {
  for (const [table, column, ddl] of COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function getDb() {
  if (!db) openDb();
  return db;
}

const stmtCache = new Map<string, ReturnType<DatabaseSync['prepare']>>();
function stmt(sql: string) {
  let s = stmtCache.get(sql);
  if (!s) { s = getDb().prepare(sql); stmtCache.set(sql, s); }
  return s;
}
export function resetStatementCache() { stmtCache.clear(); }

function norm(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return stmt(sql).all(...(norm(params) as Params)) as T[];
}
export function one<T = Row>(sql: string, ...params: any[]): T | undefined {
  return stmt(sql).get(...(norm(params) as Params)) as T | undefined;
}
export function run(sql: string, ...params: any[]) {
  return stmt(sql).run(...(norm(params) as Params));
}
export function scalar<T = number>(sql: string, ...params: any[]): T {
  const r = one(sql, ...params);
  return (r ? Object.values(r)[0] : null) as T;
}

/** Insert a plain object into a table. */
export function insert(table: string, obj: Row) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  run(sql, ...keys.map((k) => (obj[k] !== null && typeof obj[k] === 'object' ? JSON.stringify(obj[k]) : obj[k])));
  return obj;
}

export function update(table: string, id: string, patch: Row, idCol = 'id') {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idCol} = ?`;
  run(sql, ...keys.map((k) => (patch[k] !== null && typeof patch[k] === 'object' ? JSON.stringify(patch[k]) : patch[k])), id);
}

/**
 * Run fn inside one database transaction (BEGIN IMMEDIATE takes the write lock up front).
 * Nested calls join the outer transaction via savepoints, so a failing inner step rolls back cleanly.
 */
export function tx<T>(fn: () => T): T {
  const d = getDb();
  const sp = `sp${depth}`;
  d.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth++;
  try {
    const out = fn();
    depth--;
    d.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return out;
  } catch (e) {
    depth--;
    d.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

/** Atomically take the next number from a named series (invoice numbers, journal numbers ...). */
export function nextCounter(key: string): number {
  return tx(() => {
    run('INSERT INTO counter (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key);
    return scalar<number>('SELECT value FROM counter WHERE key = ?', key);
  });
}
