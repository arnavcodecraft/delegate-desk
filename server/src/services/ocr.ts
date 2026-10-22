import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { config } from '../config.ts';

// English model shipped as an npm package, so OCR works offline with no CDN download.
const LANG_PATH = path.join(config.root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');

let worker: Promise<Worker> | null = null;
function getWorker() {
  worker ??= createWorker('eng', 1, { langPath: LANG_PATH, cacheMethod: 'none', gzip: true });
  return worker;
}
export async function stopOcr() {
  if (worker) { const w = await worker; worker = null; await w.terminate(); }
}

/** Read the text in a JPG/PNG. Returns '' when OCR is off or fails; OCR only ever produces suggestions. */
export async function ocrImage(buf: Buffer): Promise<string> {
  if (!config.ocrEnabled) return '';
  try {
    const w = await getWorker();
    const { data } = await w.recognize(buf);
    return data.text ?? '';
  } catch (e) {
    console.error('[ocr]', e);
    return '';
  }
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const toPaise = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100);

export function findDate(text: string): string | null {
  const iso = text.match(/\b(20\d\d)-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)\b/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const named = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(20\d\d)\b/i);
  if (named) return `${named[3]}-${MONTHS[named[2].toLowerCase().slice(0, 3)]}-${named[1].padStart(2, '0')}`;
  return null;
}

/**
 * UTR, amount and date from a UPI / bank transfer screenshot. OCR often reads the ₹ sign as a digit ("₹2,124" -> "32,124"),
 * so when the expected amount is known, a number that matches it with one leading character dropped counts as a match.
 */
export function parseProof(text: string, expectedPaise?: number) {
  const t = text.replace(/[ \t]+/g, ' ');
  const labelled = t.match(/(?:UTR|UPI\s*Ref(?:erence)?|Ref(?:erence)?\s*No|Transaction\s*ID|Txn\s*ID)\.?\s*(?:No\.?)?\s*[:#-]?\s*([A-Z0-9]{10,22})/i);
  const bare = t.match(/\b(\d{12})\b/);
  const utr = (labelled?.[1] ?? bare?.[1] ?? null)?.toUpperCase() ?? null;
  const raw = [...t.matchAll(/(?:₹|Rs\.?|INR)?\s?(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2})/gi)].map((m) => m[1]);
  const candidates = raw.flatMap((r) => [toPaise(r), r.length > 3 && /^\d\d/.test(r) ? toPaise(r.slice(1).replace(/^,/, '')) : NaN]).filter((n) => n > 0);
  let amountPaise: number | null = null;
  if (expectedPaise != null && candidates.includes(expectedPaise)) amountPaise = expectedPaise;
  else {
    const marked = [...t.matchAll(/(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d{1,2})?)/gi)].map((m) => toPaise(m[1])).filter((n) => n > 0);
    amountPaise = marked.length ? Math.max(...marked) : null;
  }
  return { utr, amountPaise, amountFound: expectedPaise != null ? candidates.includes(expectedPaise) : null, date: findDate(t) };
}

/** Vendor, GSTIN, invoice number, date and total from a bill. */
export function parseBill(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // The 14th GSTIN character is always Z; OCR often reads it as 7 or 2.
  const g = text.toUpperCase().match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z])[Z72]([0-9A-Z])\b/);
  const gstin = g ? `${g[1]}Z${g[2]}` : null;
  const invoiceNo = text.match(/(?:Invoice|Bill)\s*(?:No\.?|Number|#)\s*[:#-]?\s*([A-Z0-9/-]{2,30})/i)?.[1] ?? null;
  const totalLine = text.match(/(?:Grand\s*Total|Total\s*Amount|Amount\s*Payable|Net\s*Amount|Total)\s*[:-]?\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const totalPaise = totalLine ? toPaise(totalLine[1]) : null;
  const gstAmounts = [...text.matchAll(/(?:CGST|SGST|IGST)[^\n\d]*\d{1,2}%?[^\n\d]*([\d,]+\.\d{2})/gi)].map((m) => toPaise(m[1]));
  const gstPaise = gstAmounts.length ? gstAmounts.reduce((s, x) => s + x, 0) : null;
  const vendor = lines.find((l) => /[A-Za-z]{3}/.test(l) && !/invoice|gstin|date|bill|tax/i.test(l)) ?? null;
  return { vendor, gstin, invoiceNo, date: findDate(text), totalPaise, gstPaise, amountPaise: totalPaise != null && gstPaise != null ? totalPaise - gstPaise : null };
}
