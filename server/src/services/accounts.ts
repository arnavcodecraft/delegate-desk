/**
 * Staff accounts: invitations by link (the invitee sets their own password) and self-service password resets.
 * Links are single-use, expire, and carry the workspace tag so they open in the right organiser's workspace.
 */
import crypto from 'node:crypto';
import { all, one, run, insert } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { ROLE_LABELS, createUser, hashPassword, type Role } from '../auth.ts';
import { bad, conflict, now, token, uid } from '../util.ts';
import { enqueue, deliverOne } from './notify.ts';
import { mailConfigured } from './mail.ts';

/** Links are sent straight away; a refusal is retried by the regular delivery run. */
export const sendNow = (id: string | null) => { if (mailConfigured()) deliverOne(id).catch((e) => console.error('[mail] not sent yet:', e?.message ?? e)); };
import { getOrg } from '../settings.ts';

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const DAYS = { invite: 7, reset: 1 / 24 } as const;

export function issueUserToken(userId: string, kind: 'invite' | 'reset') {
  run('UPDATE user_token SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL', now(), userId, kind);
  const t = token(24);
  insert('user_token', { id: uid(), user_id: userId, kind, token_hash: hash(t), expires_at: new Date(Date.now() + DAYS[kind] * 86400_000).toISOString(), created_at: now() });
  return `${config.baseUrl}/${kind === 'invite' ? 'invite' : 'reset'}/${t}`;
}

/** Invite someone to the team: they get an email with a link to set their password. */
export function inviteStaff(o: { name: string; email: string; roles: { role: Role; event_id?: string | null; committee_id?: string | null }[]; eventName?: string }) {
  if (!o.roles?.length) throw bad('Pick a role');
  const id = createUser({ name: o.name, email: o.email, password: crypto.randomBytes(24).toString('base64url'), roles: o.roles });
  const link = issueUserToken(id, 'invite');
  sendInvite(id, link, o.eventName);
  return { id, inviteLink: link };
}
function sendInvite(userId: string, link: string, eventName?: string) {
  const u = one('SELECT * FROM user WHERE id = ?', userId)!;
  const roles = all('SELECT role FROM user_role WHERE user_id = ?', userId).map((r) => ROLE_LABELS[r.role as Role] ?? r.role);
  sendNow(enqueue('staff_invite', { to: u.email, recipientKind: 'staff', vars: { name: u.name, event_name: eventName ?? getOrg().name, org_name: getOrg().name, role: roles.join(', '), invite_link: link } }));
}
export function resendInvite(userId: string) {
  const u = one('SELECT * FROM user WHERE id = ?', userId);
  if (!u) throw bad('No such user');
  if (u.last_login_at) throw conflict(`${u.name} has already signed in. Reset their password instead.`);
  const link = issueUserToken(userId, 'invite');
  sendInvite(userId, link);
  audit('user.invite_resent', 'user', userId);
  return { inviteLink: link };
}

/** Look at a link without using it (the page shows who it is for). */
export function peekUserToken(t: string) {
  const row = one('SELECT ut.*, u.name, u.email FROM user_token ut JOIN user u ON u.id = ut.user_id WHERE ut.token_hash = ?', hash(String(t ?? '')));
  if (!row || row.used_at || row.expires_at < now()) throw bad('This link has expired or was already used. Ask for a new one.');
  return { kind: row.kind as 'invite' | 'reset', name: row.name as string, email: row.email as string, userId: row.user_id as string, id: row.id as string, org: getOrg().name };
}
/** Set a password from an invitation or reset link. Signs out every other session. */
export function useUserToken(t: string, password: string, name?: string) {
  const p = peekUserToken(t);
  const hashed = hashPassword(password);
  run('UPDATE user SET password_hash = ? WHERE id = ?', hashed, p.userId);
  if (p.kind === 'invite' && name?.trim()) run('UPDATE user SET name = ? WHERE id = ?', name.trim(), p.userId);
  run('UPDATE user_token SET used_at = ? WHERE id = ?', now(), p.id);
  run('DELETE FROM session WHERE user_id = ?', p.userId);
  audit(p.kind === 'invite' ? 'user.invite_accepted' : 'user.password_reset_self', 'user', p.userId);
  return p;
}
/** Forgotten password: always answers the same way so it can't be used to find out who has an account. */
export function forgotPassword(email: string) {
  const u = one('SELECT * FROM user WHERE email = ? AND active = 1', String(email ?? '').trim().toLowerCase());
  if (!u) return;
  const link = issueUserToken(u.id, 'reset');
  sendNow(enqueue('staff_password_reset', { to: u.email, recipientKind: 'staff', vars: { name: u.name, reset_link: link } }));
  audit('user.password_reset_requested', 'user', u.id);
}
