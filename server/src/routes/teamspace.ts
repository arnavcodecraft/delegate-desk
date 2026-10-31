/** Teamspace for the conference team: chat (all channels), tasks, schedule, Ask the EB, the EB notebook, team channels and activity. */
import express from 'express';
import { requirePerm, committeeScope, can } from '../auth.ts';
import { audit } from '../audit.ts';
import { forbidden } from '../util.ts';
import { h, P } from './public.ts';
import * as chat from '../services/chat.ts';
import * as ts from '../services/teamspace.ts';
import * as calls from '../services/calls.ts';

export const teamspaceRouter = express.Router();
const staff = requirePerm('lists.read', 'messages.read');
const config = requirePerm('event.config');
/** The signed-in team member, as the chat and Teamspace see them. */
const V = (req: express.Request): Extract<chat.Viewer, { kind: 'staff' }> => {
  const scope = committeeScope(req);
  return { kind: 'staff', eventId: P(req).id, user: { id: req.auth!.user.id, name: req.auth!.user.name }, scope, admin: can(req.auth!.roleNames, 'event.config'), as: scope ? 'EB' : 'Secretariat' };
};
const q = (v: unknown) => (v ? String(v) : null);

// ---------- chat ----------
const C = '/events/:id/chat';
teamspaceRouter.get(C, staff, h((req) => { const v = V(req); return { ...chat.staffChannels(v.eventId, v.scope, v.user, v.admin), me: { id: v.user.id, who: `u:${v.user.id}`, name: v.user.name, status: chat.statusOf(v.eventId, `u:${v.user.id}`) }, statusPresets: chat.STATUS_PRESETS, slowOptions: chat.SLOW_OPTIONS }; }));
teamspaceRouter.get(`${C}/messages`, staff, h((req) => chat.read(V(req), String(req.query.channel ?? 'all'), { since: q(req.query.since), thread: q(req.query.thread), q: q(req.query.q) })));
teamspaceRouter.get(`${C}/pins`, staff, h((req) => chat.pins(V(req), String(req.query.channel ?? 'all'))));
teamspaceRouter.get(`${C}/members`, staff, h((req) => chat.members(V(req), String(req.query.channel ?? 'all'))));
teamspaceRouter.post(`${C}/ping`, staff, h((req) => chat.ping(V(req), String(req.body?.channel ?? 'all'), !!req.body?.typing)));
teamspaceRouter.get(`${C}/roster`, staff, h((req) => chat.roster(V(req), String(req.query.channel ?? 'all'))));
teamspaceRouter.post(`${C}/status`, staff, h((req) => ({ status: chat.setStatus(V(req), req.body ?? {}) })));
teamspaceRouter.post(`${C}/slow`, staff, h((req) => { chat.setSlow(V(req), String(req.body?.channel ?? ''), Number(req.body?.seconds)); audit('chat.slow', 'event', P(req).id, undefined, req.body); return { ok: true }; }));
teamspaceRouter.post(C, staff, h((req) => chat.post(V(req), req.body ?? {})));
/** One announcement in every delegate group at once (organisers). */
teamspaceRouter.post(`${C}/broadcast`, config, h((req) => {
  const v = V(req);
  const keys = chat.staffChannels(v.eventId, v.scope, v.user, v.admin).channels.map((c) => c.key);
  for (const channel of keys) chat.post(v, { channel, kind: 'announcement', title: req.body?.title, body: req.body?.body });
  audit('chat.broadcast', 'event', v.eventId, undefined, { channels: keys.length });
  return { sent: keys.length };
}));
teamspaceRouter.post(`${C}/messages/:mid/react`, staff, h((req) => { chat.react(V(req), P(req).mid, String(req.body?.emoji ?? '')); return { ok: true }; }));
teamspaceRouter.post(`${C}/messages/:mid/vote`, staff, h((req) => { chat.vote(V(req), P(req).mid, Number(req.body?.option)); return { ok: true }; }));
teamspaceRouter.post(`${C}/messages/:mid/close`, staff, h((req) => { chat.closePoll(V(req), P(req).mid); return { ok: true }; }));
teamspaceRouter.post(`${C}/messages/:mid/pin`, staff, h((req) => { chat.pin(V(req), P(req).mid, req.body?.on !== false); return { ok: true }; }));
teamspaceRouter.patch(`${C}/messages/:mid`, staff, h((req) => { chat.edit(V(req), P(req).mid, String(req.body?.body ?? '')); return { ok: true }; }));
teamspaceRouter.delete(`${C}/messages/:mid`, staff, h((req) => { chat.deleteOwn(V(req), P(req).mid); return { ok: true }; }));

// ---------- Teamspace ----------
const T = '/events/:id/teamspace';
teamspaceRouter.get(`${T}/activity`, staff, h((req) => ts.staffActivity(V(req))));
teamspaceRouter.get(`${T}/people`, staff, h((req) => ts.people(P(req).id)));
// Team channels (organisers set them up).
teamspaceRouter.get(`${T}/channels`, config, h((req) => ts.teamChannels(P(req).id)));
teamspaceRouter.post(`${T}/channels`, config, h((req) => { const id = ts.createTeamChannel(P(req).id, req.auth!.user.id, req.body ?? {}); audit('team_channel.create', 'team_channel', id); return { id }; }));
teamspaceRouter.patch(`${T}/channels/:cid`, config, h((req) => { ts.updateTeamChannel(P(req).id, P(req).cid, req.body ?? {}); audit('team_channel.update', 'team_channel', P(req).cid); return { ok: true }; }));
// Tasks.
teamspaceRouter.get(`${T}/tasks`, staff, h((req) => ts.tasks(V(req))));
teamspaceRouter.post(`${T}/tasks`, staff, h((req) => ts.createTask(V(req), req.body ?? {})));
teamspaceRouter.patch(`${T}/tasks/:tid`, staff, h((req) => ts.updateTask(V(req), P(req).tid, req.body ?? {})));
teamspaceRouter.delete(`${T}/tasks/:tid`, staff, h((req) => { ts.deleteTask(V(req), P(req).tid); return { ok: true }; }));
// Schedule: everyone in the team reads it; organisers edit it.
teamspaceRouter.get(`${T}/schedule`, staff, h((req) => ts.staffSchedule(V(req))));
teamspaceRouter.post(`${T}/schedule`, config, h((req) => ({ id: ts.addScheduleItem(P(req).id, req.body ?? {}) })));
teamspaceRouter.patch(`${T}/schedule/:sid`, config, h((req) => { ts.updateScheduleItem(P(req).id, P(req).sid, req.body ?? {}); return { ok: true }; }));
teamspaceRouter.delete(`${T}/schedule/:sid`, config, h((req) => { ts.deleteScheduleItem(P(req).id, P(req).sid); return { ok: true }; }));
// Ask the EB.
teamspaceRouter.get(`${T}/questions`, staff, h((req) => ts.staffQuestions(V(req), q(req.query.committee))));
teamspaceRouter.post(`${T}/questions/:qid`, staff, h((req) => { ts.answer(V(req), P(req).qid, req.body ?? {}); return { ok: true }; }));
// EB notebook.
teamspaceRouter.get(`${T}/notes/:cid`, staff, h((req) => ts.notes(V(req), P(req).cid)));
teamspaceRouter.post(`${T}/notes/:cid`, staff, h((req) => ({ id: ts.saveNote(V(req), P(req).cid, req.body ?? {}) })));
teamspaceRouter.delete(`${T}/notes/:cid/:nid`, staff, h((req) => { if (!P(req).nid) throw forbidden(); ts.deleteNote(V(req), P(req).cid, P(req).nid); return { ok: true }; }));

// ---------- audio and video calls, and online meetings ----------
const K = '/events/:id/calls';
const key = (req: express.Request) => String(req.body?.key ?? req.query.key ?? '');
teamspaceRouter.get(K, staff, h((req) => calls.activeCalls(V(req))));
teamspaceRouter.post(`${K}/join`, staff, h((req) => calls.join(V(req), key(req), req.body ?? {})));
teamspaceRouter.post(`${K}/poll`, staff, h((req) => calls.poll(V(req), key(req), String(req.body?.pid ?? ''), req.body?.state ?? {})));
teamspaceRouter.post(`${K}/signal`, staff, h((req) => calls.signal(V(req), key(req), String(req.body?.pid ?? ''), String(req.body?.to ?? ''), String(req.body?.type ?? ''), req.body?.data)));
teamspaceRouter.post(`${K}/leave`, staff, h((req) => { calls.leave(V(req), key(req), String(req.body?.pid ?? '')); return { ok: true }; }));
teamspaceRouter.post(`${K}/moderate`, staff, h((req) => { calls.moderate(V(req), key(req), String(req.body?.pid ?? ''), String(req.body?.action ?? ''), req.body?.target ? String(req.body.target) : undefined); return { ok: true }; }));
