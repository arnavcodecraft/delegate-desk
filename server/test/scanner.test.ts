import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { config } from '../src/config.ts';
import { checkUpload, clamdScan } from '../src/services/scanner.ts';

// A fake clamd that implements INSTREAM framing and flags the EICAR test string.
let server: net.Server; let port = 0; let received = 0;
before(async () => {
  server = net.createServer((sock) => {
    let buf = Buffer.alloc(0); let body = Buffer.alloc(0); let headerDone = false;
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!headerDone) { const i = buf.indexOf(0); if (i < 0) return; assert.equal(buf.subarray(0, i).toString(), 'zINSTREAM'); buf = buf.subarray(i + 1); headerDone = true; }
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) { received = body.length; sock.end(body.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0'); return; }
        if (buf.length < 4 + len) return;
        body = Buffer.concat([body, buf.subarray(4, 4 + len)]); buf = buf.subarray(4 + len);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as net.AddressInfo).port;
});
after(() => server.close());

const png = (extra: string | Buffer) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(extra)]);

test('clean file passes, every byte is streamed in chunks', async () => {
  const big = png(Buffer.alloc(200_000, 7));
  const r = await clamdScan(big, '127.0.0.1', port);
  assert.deepEqual(r, { clean: true, scanned: true });
  assert.equal(received, big.length);
});

test('EICAR test signature is blocked at upload', async () => {
  config.clamav.host = '127.0.0.1'; config.clamav.port = port;
  await assert.rejects(() => checkUpload(png('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')), /virus scanner \(Eicar-Test-Signature\)/);
  assert.equal((await checkUpload(png('hello'))).scanned, true);
});

test('scanner down: allowed by default, refused when CLAMAV_REQUIRED', async () => {
  config.clamav.host = '127.0.0.1'; config.clamav.port = 1;
  assert.equal((await checkUpload(png('x'))).scanned, false);
  config.clamav.required = true;
  await assert.rejects(() => checkUpload(png('x')), /scanner is unavailable/);
  config.clamav.required = false; config.clamav.host = '';
});

test('non-image files and PDFs with JavaScript are refused before scanning', async () => {
  await assert.rejects(() => checkUpload(Buffer.from('MZ executable')), /JPG, PNG or PDF/);
  await assert.rejects(() => checkUpload(Buffer.from('%PDF-1.7 /OpenAction << /JS (app.alert(1)) >>')), /active content/);
});
