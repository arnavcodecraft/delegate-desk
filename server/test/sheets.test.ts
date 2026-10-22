import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { freshDb, person } from './helpers.ts';
import { one } from '../src/db.ts';
import { asSystem } from '../src/util.ts';
import { config } from '../src/config.ts';
import { createSync, syncSheet, resetTokenCache } from '../src/services/sheets.ts';
const { register } = await import('../src/services/registrations.ts');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sheets = new Map<string, any[][]>(); const tabs = new Set<string>(['Sheet1']); let tokenCalls = 0;
let server: http.Server;
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const url = decodeURIComponent(req.url!);
      if (url === '/token') {
        const assertion = new URLSearchParams(raw).get('assertion')!;
        const [h, p, sig] = assertion.split('.');
        const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url'));
        const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
        if (!ok || claims.scope !== 'https://www.googleapis.com/auth/spreadsheets' || claims.iss !== 'sync@demo.iam.gserviceaccount.com') { res.statusCode = 401; return res.end('{"error":"invalid_grant"}'); }
        tokenCalls++; return res.end(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }));
      }
      if (req.headers.authorization !== 'Bearer ya29.test') { res.statusCode = 401; return res.end('{}'); }
      if (req.method === 'GET') return res.end(JSON.stringify({ sheets: [...tabs].map((title) => ({ properties: { title } })) }));
      if (url.endsWith(':batchUpdate')) { tabs.add(JSON.parse(raw).requests[0].addSheet.properties.title); return res.end('{}'); }
      if (url.endsWith(':clear')) return res.end('{}');
      if (req.method === 'PUT') { sheets.set(url.split('/values/')[1].split('?')[0], JSON.parse(raw).values); return res.end('{}'); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.google.serviceAccountJson = JSON.stringify({ client_email: 'sync@demo.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  config.google.tokenUrl = `${base}/token`; config.google.sheetsBase = base;
  resetTokenCache();
});
after(() => server.close());

test('pushes a live list to a new tab, without contact details or minors by default', async () => {
  const ctx = freshDb();
  asSystem(() => register(ctx.eventId, person({ full_name: 'Adult Delegate' })));
  asSystem(() => register(ctx.eventId, person({ full_name: 'Young Delegate', dob: '2012-02-02', guardian_name: 'P', guardian_email: 'p@example.com' })));
  const id = asSystem(() => createSync(ctx.eventId, { list_kind: 'master', spreadsheet_id: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', sheet_name: 'Delegates' }));
  assert.equal(one('SELECT spreadsheet_id FROM sheet_sync WHERE id = ?', id)!.spreadsheet_id, '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
  const r = await syncSheet(id);
  assert.ok(tabs.has('Delegates'), 'tab created');
  const values = sheets.get("'Delegates'!A1")!;
  assert.equal(values[0][0], 'ID');
  assert.ok(!values[0].includes('Email') && !values[0].includes('Mobile'), 'no contact columns');
  const names = values.slice(1).map((v) => v[1]);
  assert.ok(names.includes('Adult Delegate') && !names.includes('Young Delegate'));
  assert.equal(r.rows, values.length - 1);
  assert.ok(typeof values[1][values[0].indexOf('Fee')] === 'number', 'money as rupee numbers');
  await syncSheet(id);
  assert.equal(tokenCalls, 1, 'access token reused until expiry');
});

test('a sharing problem is recorded on the sync for the admin to see', async () => {
  const ctx = { eventId: one('SELECT id FROM event')!.id };
  config.google.sheetsBase = 'http://127.0.0.1:1';
  const id = asSystem(() => createSync(ctx.eventId, { list_kind: 'waitlist', spreadsheet_id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' }));
  await assert.rejects(() => syncSheet(id));
  assert.ok(one('SELECT last_error FROM sheet_sync WHERE id = ?', id)!.last_error);
});
