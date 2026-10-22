import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

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
  // The built-in sandbox gateway is always available in development; in production only when explicitly allowed.
  allowSandbox: process.env.NODE_ENV !== 'production' || process.env.ALLOW_SANDBOX === '1',
  isProd: process.env.NODE_ENV === 'production',
  timezone: 'Asia/Kolkata',
};
