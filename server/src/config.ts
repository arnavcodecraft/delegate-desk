import path from 'node:path';
import { workspaceStore } from './util.ts';

const root = path.resolve(import.meta.dirname, '../..');
// Settings can live in a .env file next to package.json (values already in the environment win). Tests never load it.
if (!process.env.NODE_TEST_CONTEXT && !process.env.DD_NO_ENV_FILE) { try { process.loadEnvFile(path.join(root, '.env')); } catch { /* no .env file */ } }

export const config = {
  root,
  port: Number(process.env.PORT ?? 8080),
  baseUrl: (process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, ''),
  dbPath: process.env.DB_PATH ?? path.join(root, 'data', 'delegatedesk.db'),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(root, 'data', 'uploads'),
  // Used to sign expiring file links and the built-in sandbox gateway's webhooks.
  appSecret: process.env.APP_SECRET ?? 'dev-only-change-me',
  smtpUrl: process.env.SMTP_URL ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'DelegateDesk <no-reply@localhost>',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
  cashfree: {
    appId: process.env.CASHFREE_APP_ID ?? '',
    secretKey: process.env.CASHFREE_SECRET_KEY ?? '',
    env: (process.env.CASHFREE_ENV ?? 'sandbox') as 'sandbox' | 'production',
    apiVersion: process.env.CASHFREE_API_VERSION ?? '2023-08-01',
  },
  jobsEnabled: process.env.JOBS !== 'off',
  ocrEnabled: process.env.OCR !== 'off',
  backup: {
    enabled: process.env.BACKUPS !== 'off', key: process.env.BACKUP_KEY ?? '',
    dir: process.env.BACKUP_DIR ?? path.join(root, 'data', 'backups'), keep: Number(process.env.BACKUP_KEEP ?? 30),
  },
  // Claude-powered assistance turns on when Anthropic credentials are present.
  ai: { enabled: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), baseUrl: process.env.ANTHROPIC_BASE_URL ?? '' },
  google: {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '', serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE ?? '',
    tokenUrl: process.env.GOOGLE_TOKEN_URL ?? '', sheetsBase: process.env.GOOGLE_SHEETS_BASE ?? 'https://sheets.googleapis.com',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '', phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '', verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0', apiBase: process.env.WHATSAPP_API_BASE ?? 'https://graph.facebook.com',
  },
  msg91: { authKey: process.env.MSG91_AUTH_KEY ?? '', apiBase: process.env.MSG91_API_BASE ?? 'https://control.msg91.com' },
  clamav: { host: process.env.CLAMAV_HOST ?? '', port: Number(process.env.CLAMAV_PORT ?? 3310), required: process.env.CLAMAV_REQUIRED === '1' },
  // The built-in sandbox gateway is always available in development; in production only when explicitly allowed.
  allowSandbox: process.env.NODE_ENV !== 'production' || process.env.ALLOW_SANDBOX === '1',
  isProd: process.env.NODE_ENV === 'production',
  timezone: 'Asia/Kolkata',
};

/** Upload folder of the current workspace (each organiser's files are kept apart). */
export function uploadDir() {
  const w = workspaceStore.getStore();
  return w?.dir ? path.join(w.dir, 'uploads') : config.uploadDir;
}
/** Backup folder of the current workspace. */
export function backupDir() {
  const w = workspaceStore.getStore();
  return w?.dir ? path.join(w.dir, 'backups') : config.backup.dir;
}
