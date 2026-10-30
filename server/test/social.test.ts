import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, person } from './helpers.ts';
import { asSystem } from '../src/util.ts';

const { register } = await import('../src/services/registrations.ts');
const social = await import('../src/services/social.ts');
const { trackView, normChannel } = await import('../src/services/conference.ts');

test('social media: tracked links, results per platform and campaign, captions and the planner', () => {
  const ctx = freshDb();
  assert.equal(normChannel('twitter'), 'x');
  const tag = social.campaignTag('Early bird week!');
  assert.equal(tag, 'c-early-bird-week');
  assert.equal(normChannel(tag), tag);
  for (let i = 0; i < 4; i++) trackView(ctx.eventId, 'instagram');
  trackView(ctx.eventId, tag);
  asSystem(() => register(ctx.eventId, person({ preferences: [ctx.committeeIds.DISEC], channel: 'instagram' })));
  const o = social.socialOverview(ctx.eventId);
  const ig = o.rows.find((r) => r.channel === 'instagram')!;
  assert.deepEqual({ visits: ig.visits, applied: ig.applied, conversion: ig.conversion }, { visits: 4, applied: 1, conversion: 25 });
  assert.match(ig.registerLink!, /\/register\/BGYS27\?src=instagram$/);
  assert.ok(o.rows.some((r) => r.channel === tag && r.label === 'Campaign: early-bird-week' && r.visits === 1));
  assert.equal(o.series.length, 14);
  assert.ok(o.captions.find((c) => c.key === 'open')!.text.includes('/c/bgys27'));
  const { id } = social.addPost(ctx.eventId, { platform: 'instagram', caption: 'Registrations open!', status: 'scheduled', scheduled_for: '2026-11-05T10:00:00.000Z' });
  social.updatePost(ctx.eventId, id, { platform: 'instagram', caption: 'Registrations open!', status: 'posted', link: 'https://instagram.com/p/abc' });
  assert.equal(social.socialOverview(ctx.eventId).posts[0].status, 'posted');
  assert.throws(() => social.addPost(ctx.eventId, { platform: 'myspace', caption: 'x' }), /Choose a platform/);
  assert.throws(() => social.addPost(ctx.eventId, { platform: 'x', caption: 'x', link: 'javascript:alert(1)' }), /Links start with/);
  social.removePost(ctx.eventId, id);
  assert.equal(social.socialOverview(ctx.eventId).posts.length, 0);
});
