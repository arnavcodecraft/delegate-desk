/** Participant accounts: sign-up, sign-in, email confirmation, password reset, profile and "my conferences". */
import express from 'express';
import { rateLimit } from '../auth.ts';
import { h } from './public.ts';
import { mailConfigured } from '../services/mail.ts';
import {
  signUp, signIn, startPersonSession, endPersonSession, currentPerson, requirePerson, verifyEmail, resendVerification,
  forgot, resetWithCode, showCodesOnScreen, changePassword, updateProfile, deleteAccount, participations, personView,
} from '../services/people.ts';

export const meRouter = express.Router();

meRouter.get('/', h((req) => {
  const p = currentPerson(req);
  return p ? { person: personView(p), conferences: participations(p), mail: mailConfigured(), codesOnScreen: showCodesOnScreen() } : { person: null, mail: mailConfigured() };
}));
meRouter.post('/signup', h(async (req, res) => {
  // Generous per address (a whole school lab can share one), with a site-wide ceiling against floods.
  rateLimit(`signup:${req.ip}`, Number(process.env.SIGNUP_PER_IP_HOUR ?? 40), 60 * 60_000);
  rateLimit('signup:all', Number(process.env.SIGNUP_PER_MINUTE ?? 300), 60_000);
  const p = await signUp(req.body ?? {});
  startPersonSession(res, p.id);
  return { person: personView(p), devCode: (p as any).devCode, mail: mailConfigured() };
}));
meRouter.post('/login', h(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  rateLimit(`plogin:${req.ip}:${email}`, 10, 15 * 60_000);
  const p = await signIn(email, String(req.body?.password ?? ''));
  startPersonSession(res, p.id);
  return { person: personView(p) };
}));
meRouter.post('/logout', h((req, res) => { endPersonSession(req, res); return { ok: true }; }));
meRouter.post('/verify', h((req) => { const p = requirePerson(req); rateLimit(`pverify:${p.id}`, 10, 15 * 60_000); verifyEmail(p, String(req.body?.code ?? '')); return { ok: true }; }));
meRouter.post('/verify/resend', h((req) => { const p = requirePerson(req); rateLimit(`presend:${p.id}`, 4, 15 * 60_000); return { ok: true, devCode: resendVerification(p) }; }));
meRouter.post('/forgot', h((req) => { rateLimit(`pforgot:${req.ip}`, 5, 15 * 60_000); const devCode = forgot(String(req.body?.email ?? '')); return { ok: true, devCode: devCode ?? undefined }; }));
meRouter.post('/reset', h(async (req, res) => {
  rateLimit(`preset:${req.ip}`, 10, 15 * 60_000);
  const p = await resetWithCode(String(req.body?.email ?? ''), String(req.body?.code ?? ''), String(req.body?.password ?? ''));
  startPersonSession(res, p.id);
  return { ok: true };
}));
meRouter.patch('/', h((req) => { const p = requirePerson(req); updateProfile(p, req.body ?? {}); return { person: personView(requirePerson(req)) }; }));
meRouter.post('/password', h((req) => { const p = requirePerson(req); changePassword(p, String(req.body?.current ?? ''), String(req.body?.next ?? '')); return { ok: true }; }));
meRouter.post('/delete', h((req, res) => { const p = requirePerson(req); deleteAccount(p, String(req.body?.password ?? '')); endPersonSession(req, res); return { ok: true }; }));
