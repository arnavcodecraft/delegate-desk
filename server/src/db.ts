import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { workspaceStore } from './util.ts';

export type Row = any;
type Params = any[];

let db: DatabaseSync;   // the main workspace's database
const depthOf = new WeakMap<DatabaseSync, number>();

/** Open a database file with the full schema applied (used for the main workspace and each organiser's). */
export function openDatabase(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  d.exec(fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8'));
  migrate(d);
  return d;
}

export function openDb(file = config.dbPath) {
  db = openDatabase(file);
  return db;
}

/** Columns added after the first release, applied to every database at startup (each ALTER runs once). */
const COLUMNS: [table: string, column: string, ddl: string][] = [
  ['user', 'last_login_at', 'TEXT'],
  ['template', 'provider_template', 'TEXT'],
  ['template', 'language', "TEXT NOT NULL DEFAULT 'en'"],
  ['template', 'params', "TEXT NOT NULL DEFAULT '[]'"],
  ['notification', 'vars', "TEXT NOT NULL DEFAULT '{}'"],
  ['notification', 'provider_message_id', 'TEXT'],
  ['notification', 'delivery_status', 'TEXT'],
  ['expense', 'is_po', 'INTEGER NOT NULL DEFAULT 0'],
  ['committee', 'type', "TEXT NOT NULL DEFAULT 'mun'"],          // mun | crisis | custom | press
  ['committee', 'topics', "TEXT NOT NULL DEFAULT '[]'"],
  ['committee', 'difficulty', "TEXT NOT NULL DEFAULT 'intermediate'"],
  ['committee', 'language', "TEXT NOT NULL DEFAULT 'English'"],
  ['committee', 'emblem', 'TEXT'],
  ['portfolio', 'code', 'TEXT'],                                  // ISO country code, for flags
  ['registration', 'channel', 'TEXT'],                            // where the delegate came from (instagram, whatsapp ...)
  ['registration', 'review_score', 'INTEGER'],
  ['registration', 'review_note', 'TEXT'],
  ['registration', 'motivation', 'TEXT'],
  ['registration', 'mun_count', 'INTEGER NOT NULL DEFAULT 0'],          // MUNs attended
  ['registration', 'other_events', 'INTEGER NOT NULL DEFAULT 0'],       // debates, youth parliaments, Model G20 …
  ['registration', 'awards_count', 'INTEGER NOT NULL DEFAULT 0'],       // awards won at MUNs
  ['registration', 'portfolio_prefs', "TEXT NOT NULL DEFAULT '{}'"],    // committee id → preferred portfolio id
  ['swap_request', 'to_portfolio_id', 'TEXT'],                          // a specific portfolio the delegate asked for
  ['swap_request', 'reason', 'TEXT'],
  // Teamspace: threads, announcements, polls, pins, edits and mentions on chat messages.
  ['chat_message', 'parent_id', 'TEXT'],
  ['chat_message', 'kind', "TEXT NOT NULL DEFAULT 'message'"],         // message | announcement | poll
  ['chat_message', 'title', 'TEXT'],
  ['chat_message', 'poll', 'TEXT'],                                    // {"options": [...], "closed": false}
  ['chat_message', 'mentions', "TEXT NOT NULL DEFAULT '[]'"],          // [{"id": "d:<reg>" | "u:<user>", "name": "..."}]
  ['chat_message', 'pinned_at', 'TEXT'],
  ['chat_message', 'edited_at', 'TEXT'],
  ['chat_message', 'updated_at', 'TEXT'],
  ['schedule_item', 'call_channel', 'TEXT'],                           // an online meeting: who can join is who can open this channel                              // any change: the page refreshes changed messages                                   // wrong_portfolio | prefer_other | experience | other
];
function migrate(db: DatabaseSync) {
  for (const [table, column, ddl] of COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/** The database of the workspace this code runs in (the main one outside any organiser workspace). */
export function getDb(): DatabaseSync {
  const w = workspaceStore.getStore();
  if (w?.db) return w.db as DatabaseSync;
  if (!db) openDb();
  return db;
}
export const mainDb = () => { if (!db) openDb(); return db; };

const stmtCaches = new WeakMap<DatabaseSync, Map<string, ReturnType<DatabaseSync['prepare']>>>();
function stmt(sql: string) {
  const d = getDb();
  let cache = stmtCaches.get(d);
  if (!cache) { cache = new Map(); stmtCaches.set(d, cache); }
  let s = cache.get(sql);
  if (!s) { s = d.prepare(sql); cache.set(sql, s); }
  return s;
}
export function resetStatementCache() { stmtCaches.delete(getDb()); }

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
  const depth = depthOf.get(d) ?? 0;
  const sp = `sp${depth}`;
  d.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depthOf.set(d, depth + 1);
  try {
    const out = fn();
    depthOf.set(d, depth);
    d.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return out;
  } catch (e) {
    depthOf.set(d, depth);
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
