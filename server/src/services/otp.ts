import crypto from 'node:crypto';
import { one, run, insert, scalar } from '../db.ts';
import { config } from '../config.ts';
import { audit } from '../audit.ts';
import { addHours, bad, conflict, isIndianMobile, normMobile, now, sha256, uid, HttpError } from '../util.ts';
import { enqueue, deliverPending } from './notify.ts';
import { whatsapp, sms } from './channels.ts';

const TTL_MIN = 10, MAX_ATTEMPTS = 5;
const hash = (otpId: string, code: string) => sha256(`${config.appSecret}:${otpId}:${code}`);

/** Send a 6-digit code by SMS (or WhatsApp). Without any provider in development the code is returned for testing. */
export async function sendOtp(event: { id: string; name: string }, mobileRaw: string) {
  if (!isIndianMobile(mobileRaw)) throw bad('Enter a 10-digit Indian mobile number');
  const mobile = normMobile(mobileRaw);
  const recent = scalar<number>('SELECT COUNT(*) FROM otp_code WHERE mobile = ? AND created_at > ?', mobile, new Date(Date.now() - 15 * 60_000).toISOString()) ?? 0;
  if (recent >= 3) throw new HttpError(429, 'Too many codes requested. Please wait 15 minutes.');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const id = uid();
  insert('otp_code', { id, event_id: event.id, mobile, code_hash: hash(id, code), expires_at: addHours(now(), TTL_MIN / 60), created_at: now() });
  const channel = sms.configured() ? 'sms' : whatsapp.configured() ? 'whatsapp' : null;
  if (channel) {
    enqueue('mobile_otp', { to: mobile, channel, recipientKind: 'otp', vars: { code, event_name: event.name } });
    await deliverPending();
    return { sent: true, channel };
  }
  if (config.isProd) throw conflict('Mobile verification is switched on but no SMS or WhatsApp provider is configured.');
  return { sent: false, channel: null, devCode: code };
}

export function verifyOtp(eventId: string, mobileRaw: string, code: string) {
  const mobile = normMobile(mobileRaw);
  const o = one('SELECT * FROM otp_code WHERE event_id = ? AND mobile = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1', eventId, mobile);
  if (!o || o.expires_at < now()) throw bad('That code has expired. Request a new one.');
  if (o.attempts >= MAX_ATTEMPTS) throw bad('Too many wrong attempts. Request a new code.');
  run('UPDATE otp_code SET attempts = attempts + 1 WHERE id = ?', o.id);
  if (hash(o.id, String(code).trim()) !== o.code_hash) throw bad('That code is not right.');
  run('UPDATE otp_code SET verified_at = ? WHERE id = ?', now(), o.id);
  // A signed, single-use proof the registration form sends back.
  const token = `${o.id}.${crypto.createHmac('sha256', config.appSecret).update(`otp:${o.id}:${mobile}`).digest('base64url')}`;
  return { token };
}

/** Called inside registration: the token must match this mobile, be verified within the hour, and not be reused. */
export function consumeOtpToken(eventId: string, mobileRaw: string, token: string | undefined) {
  const mobile = normMobile(mobileRaw);
  const [id, sig] = String(token ?? '').split('.');
  const o = id ? one('SELECT * FROM otp_code WHERE id = ? AND event_id = ?', id, eventId) : null;
  const want = o ? crypto.createHmac('sha256', config.appSecret).update(`otp:${o.id}:${mobile}`).digest('base64url') : '';
  if (!o || !sig || sig !== want || !o.verified_at || o.used_at || o.mobile !== mobile || addHours(o.verified_at, 1) < now()) {
    throw bad('Please verify your mobile number', { fields: { mobile: 'Verify this number with the code we send you' } });
  }
  run('UPDATE otp_code SET used_at = ? WHERE id = ?', now(), o.id);
  audit('otp.used', 'otp_code', o.id);
}
