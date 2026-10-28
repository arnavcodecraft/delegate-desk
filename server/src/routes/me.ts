/** Participant accounts: sign-up, sign-in, email confirmation, password reset, profile and "my conferences". */
import express from 'express';
import { rateLimit } from '../auth.ts';
import { h } from './public.ts';
import {
  signUp, signIn, startPersonSession, endPersonSession, currentPerson, requirePerson, verifyEmail, resendVerification,
  forgot, resetWithCode, changePassword, updateProfile, deleteAccount, participations, personView,
} from '../services/people.ts';

export const meRouter = express.Router();

meRouter.get('/', h((req) => {
  const p = currentPerson(req);
  return p ? { person: personView(p), conferences: participations(p) } : { person: null };
}));
meRouter.post('/signup', h((req, res) => {
  rateLimit(`signup:${req.ip}`, 10, 60 * 60_000);
  const p = signUp(req.body ?? {});
  startPersonSession(res, p.id);
  return { person: personView(p), devCode: (p as any).devCode };
}));
meRouter.post('/login', h((req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  rateLimit(`plogin:${req.ip}:${email}`, 10, 15 * 60_000);
  const p = signIn(email, String(req.body?.password ?? ''));
  startPersonSession(res, p.id);
  return { person: personView(p) };
}));
meRouter.post('/logout', h((req, res) => { endPersonSession(req, res); return { ok: true }; }));
meRouter.post('/verify', h((req) => { const p = requirePerson(req); rateLimit(`pverify:${p.id}`, 10, 15 * 60_000); verifyEmail(p, String(req.body?.code ?? '')); return { ok: true }; }));
meRouter.post('/verify/resend', h((req) => { const p = requirePerson(req); rateLimit(`presend:${p.id}`, 4, 15 * 60_000); return { ok: true, devCode: resendVerification(p) }; }));
meRouter.post('/forgot', h((req) => { rateLimit(`pforgot:${req.ip}`, 5, 15 * 60_000); const devCode = forgot(String(req.body?.email ?? '')); return { ok: true, devCode: devCode ?? undefined }; }));
meRouter.post('/reset', h((req, res) => {
  rateLimit(`preset:${req.ip}`, 10, 15 * 60_000);
  const p = resetWithCode(String(req.body?.email ?? ''), String(req.body?.code ?? ''), String(req.body?.password ?? ''));
  startPersonSession(res, p.id);
  return { ok: true };
}));
meRouter.patch('/', h((req) => { const p = requirePerson(req); updateProfile(p, req.body ?? {}); return { person: personView(requirePerson(req)) }; }));
meRouter.post('/password', h((req) => { const p = requirePerson(req); changePassword(p, String(req.body?.current ?? ''), String(req.body?.next ?? '')); return { ok: true }; }));
meRouter.post('/delete', h((req, res) => { const p = requirePerson(req); deleteAccount(p, String(req.body?.password ?? '')); endPersonSession(req, res); return { ok: true }; }));
