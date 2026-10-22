import net from 'node:net';
import { config } from '../config.ts';
import { bad, HttpError } from '../util.ts';
import { scan as staticChecks, sniff } from './evidence.ts';

export interface ScanResult { clean: boolean; scanned: boolean; signature?: string }

/** Stream a buffer to clamd with the INSTREAM command: 4-byte big-endian length per chunk, zero-length chunk to finish. */
export function clamdScan(buf: Buffer, host = config.clamav.host, port = config.clamav.port, timeoutMs = 15000): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let reply = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('clamd timed out')); }, timeoutMs);
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => { reply += d.toString('utf8'); });
    sock.on('end', () => {
      clearTimeout(timer);
      const r = reply.replace(/\0/g, '').trim();
      if (/OK$/.test(r)) resolve({ clean: true, scanned: true });
      else if (/FOUND$/.test(r)) resolve({ clean: false, scanned: true, signature: r.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, '') });
      else reject(new Error(`clamd: ${r || 'no reply'}`));
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Every upload goes through here: real file type, static PDF checks, then ClamAV when configured.
 * With CLAMAV_REQUIRED=1 an unreachable scanner rejects the upload instead of letting it through.
 */
export async function checkUpload(buf: Buffer): Promise<ScanResult> {
  const mime = sniff(buf);
  if (!mime) throw bad('Upload a JPG, PNG or PDF file');
  staticChecks(buf, mime);
  if (!config.clamav.host) return { clean: true, scanned: false };
  try {
    const r = await clamdScan(buf);
    if (!r.clean) throw bad(`This file was blocked by the virus scanner (${r.signature}). Please upload a different file.`);
    return r;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('[clamav]', e);
    if (config.clamav.required) throw new HttpError(503, 'The virus scanner is unavailable, so uploads are paused. Please try again shortly.');
    return { clean: true, scanned: false };
  }
}
