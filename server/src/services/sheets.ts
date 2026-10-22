import crypto from 'node:crypto';
import fs from 'node:fs';
import { all, one, insert, update, run } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { bad, notFound, now, uid, ctx } from '../util.ts';
import { runList, LISTS } from './lists.ts';

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

export function serviceAccount(): ServiceAccount | null {
  const raw = config.google.serviceAccountJson || (config.google.serviceAccountFile && fs.existsSync(config.google.serviceAccountFile) ? fs.readFileSync(config.google.serviceAccountFile, 'utf8') : '');
  if (!raw) return null;
  try { const sa = JSON.parse(raw); return sa.client_email && sa.private_key ? sa : null; } catch { return null; }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
let cached: { token: string; exp: number } | null = null;

/** OAuth 2.0 service-account flow: a JWT signed with the account's RSA key, exchanged for an access token. */
export async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('Google service account is not configured');
  const iat = Math.floor(Date.now() / 1000);
  const aud = config.google.tokenUrl || sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud, iat, exp: iat + 3600 }))}`;
  const jwt = `${unsigned}.${b64url(crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key))}`;
  const res = await fetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }), signal: AbortSignal.timeout(15000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google sign-in failed: ${data.error_description ?? data.error ?? res.status}`);
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}
export function resetTokenCache() { cached = null; }

async function sheetsApi(method: string, path: string, body?: unknown) {
  const res = await fetch(`${config.google.sheetsBase}/v4/spreadsheets/${path}`, {
    method, headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 403 || res.status === 404) throw new Error(`Google Sheets ${res.status}: share the spreadsheet with ${serviceAccount()?.client_email} as an editor, and check the spreadsheet id`);
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  return data;
}

const CONTACT_COLS = ['email', 'mobile', 'dob', 'emergency_phone', 'emergency_name', 'head_email', 'phone'];
const moneyCol = (k: string) => /paise|amount|_due|total|balance|commission|revenue|fees|earned|paid_out/.test(k);

/** The rows a sync writes: same live list as the screen, minus contact details and minors unless the sync allows them. */
export function sheetRows(s: Record<string, any>) {
  const out = runList(s.list_kind, s.event_id, { committeeId: s.committee_id ?? undefined }, s.committee_id ? [s.committee_id] : null);
  const cols = out.columns.filter((c) => s.include_contacts || !CONTACT_COLS.includes(c.key));
  const rows = s.include_minors ? out.rows : out.rows.filter((r) => !r.is_minor);
  const values: (string | number)[][] = [cols.map((c) => c.label)];
  for (const r of rows) values.push(cols.map((c) => { const v = r[c.key]; return v == null ? '' : moneyCol(c.key) && typeof v === 'number' ? v / 100 : typeof v === 'number' ? v : String(v); }));
  return values;
}

export async function syncSheet(id: string) {
  const s = one('SELECT * FROM sheet_sync WHERE id = ?', id);
  if (!s) throw notFound('Sheet sync');
  try {
    const values = sheetRows(s);
    const meta = await sheetsApi('GET', `${encodeURIComponent(s.spreadsheet_id)}?fields=sheets.properties.title`);
    if (!(meta.sheets ?? []).some((x: any) => x.properties?.title === s.sheet_name)) {
      await sheetsApi('POST', `${encodeURIComponent(s.spreadsheet_id)}:batchUpdate`, { requests: [{ addSheet: { properties: { title: s.sheet_name } } }] });
    }
    const range = encodeURIComponent(`'${s.sheet_name.replace(/'/g, "''")}'`);
    await sheetsApi('POST', `${encodeURIComponent(s.spreadsheet_id)}/values/${range}:clear`, {});
    await sheetsApi('PUT', `${encodeURIComponent(s.spreadsheet_id)}/values/${encodeURIComponent(`'${s.sheet_name.replace(/'/g, "''")}'!A1`)}?valueInputOption=RAW`, { values });
    update('sheet_sync', id, { last_synced_at: now(), last_rows: values.length - 1, last_error: null });
    return { rows: values.length - 1 };
  } catch (e: any) {
    update('sheet_sync', id, { last_error: String(e.message ?? e).slice(0, 500), last_synced_at: now() });
    throw e;
  }
}

export async function syncDue() {
  if (!serviceAccount()) return 0;
  let n = 0;
  for (const s of all('SELECT * FROM sheet_sync WHERE active = 1')) {
    if (s.last_synced_at && new Date(s.last_synced_at).getTime() + s.interval_minutes * 60_000 > Date.now()) continue;
    try { await syncSheet(s.id); n++; } catch (e) { console.error('[sheets]', (e as Error).message); }
  }
  return n;
}

export function createSync(eventId: string, b: Record<string, any>) {
  if (!LISTS[b.list_kind]) throw bad('Pick a list');
  if (LISTS[b.list_kind].needsCommittee && !b.committee_id) throw bad('Pick a committee for this list');
  const sid = String(b.spreadsheet_id ?? '').match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1] ?? String(b.spreadsheet_id ?? '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(sid)) throw bad('Paste the spreadsheet link or id');
  const id = uid();
  const row = { id, event_id: eventId, list_kind: b.list_kind, committee_id: b.committee_id || null, spreadsheet_id: sid, sheet_name: String(b.sheet_name || LISTS[b.list_kind].title).slice(0, 90), include_contacts: b.include_contacts ? 1 : 0, include_minors: b.include_minors ? 1 : 0, interval_minutes: Math.max(5, Number(b.interval_minutes ?? 15)), created_by: ctx().userId ?? null, created_at: now() };
  insert('sheet_sync', row);
  audit('sheets.create', 'sheet_sync', id, undefined, row);
  return id;
}
export function deleteSync(id: string) { run('DELETE FROM sheet_sync WHERE id = ?', id); audit('sheets.delete', 'sheet_sync', id); }
