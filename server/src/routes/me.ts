/** Participant accounts: sign-up, sign-in, email confirmation, password reset, profile and "my conferences". */
import express from 'express';
import { rateLimit, endSession } from '../auth.ts';
import { HttpError } from '../util.ts';
import { one } from '../db.ts';
import { h } from './public.ts';
import { mailConfigured } from '../services/mail.ts';
import {
  signUp, signIn, startPersonSession, endPersonSession, currentPerson, requirePerson, verifyEmail, resendVerification,
  forgot, resetWithCode, showCodesOnScreen, personForStaff, changePassword, updateProfile, deleteAccount, participations, personView,
} from '../services/people.ts';
import { saved, setSaved, isSaved, cv, addCv, updateCv, removeCv, saveProfileExtras, deleteProfileData } from '../services/profile.ts';

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
meRouter.post('/logout', h((req, res) => { endPersonSession(req, res); if (req.auth) endSession(req, res); return { ok: true }; }));
/** An organiser already signed in opens their delegate profile (same email; created on first use). */
meRouter.post('/from-staff', h(async (req, res) => {
  if (!req.auth) throw new HttpError(401, 'Sign in first');
  rateLimit(`fromstaff:${req.auth.user.id}`, 10, 15 * 60_000);
  const user = one('SELECT * FROM user WHERE id = ?', req.auth.user.id);
  const p = user && await personForStaff(user, req.body?.password == null ? undefined : String(req.body.password));
  // A delegate account with this email and a different password: ask for that password once to link them.
  if (!p) throw new HttpError(409, 'You already have a delegate account with this email. Enter its password to open it here.');
  startPersonSession(res, p.id);
  return { person: personView(p) };
}));
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
meRouter.post('/delete', h((req, res) => { const p = requirePerson(req); deleteAccount(p, String(req.body?.password ?? '')); deleteProfileData(p.id); endPersonSession(req, res); return { ok: true }; }));

// Saved conferences, social links and the MUN CV.
meRouter.get('/saved', h((req) => saved(requirePerson(req))));
meRouter.get('/saved/:slug', h((req) => { const p = currentPerson(req); return { saved: p ? isSaved(p, String(req.params.slug)) : false, signedIn: !!p }; }));
meRouter.post('/saved', h((req) => setSaved(requirePerson(req), String(req.body?.slug ?? ''), req.body?.on !== false)));
meRouter.get('/cv', h((req) => cv(requirePerson(req))));
meRouter.post('/cv', h((req) => addCv(requirePerson(req), req.body ?? {})));
meRouter.patch('/cv/:id', h((req) => { updateCv(requirePerson(req), String(req.params.id), req.body ?? {}); return { ok: true }; }));
meRouter.delete('/cv/:id', h((req) => { removeCv(requirePerson(req), String(req.params.id)); return { ok: true }; }));
meRouter.post('/profile-extras', h((req) => saveProfileExtras(requirePerson(req), req.body ?? {})));
