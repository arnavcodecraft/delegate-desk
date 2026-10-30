import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';

const people = await import('../src/services/people.ts');
const profile = await import('../src/services/profile.ts');
const { listings } = await import('../src/platform.ts');

let p: any;
before(async () => {
  const ctx = freshDb();
  const { syncListing } = await import('../src/services/conference.ts');
  const { claimCode } = await import('../src/platform.ts');
  const { asSystem } = await import('../src/util.ts');
  const { one } = await import('../src/db.ts');
  asSystem(() => { claimCode(one('SELECT code FROM event WHERE id = ?', ctx.eventId)!.code, ctx.eventId); syncListing(ctx.eventId); });
  const s = await people.signUp({ name: 'Mira Shah', email: 'mira-cv@example.com', password: 'mira-pass-12345' });
  p = people.peopleDb().prepare('SELECT * FROM person WHERE id = ?').get(s.id);
});

test('save and unsave a conference', () => {
  const slug = listings({ includeUnpublished: true })[0]?.slug;
  assert.ok(slug, 'the seed lists a conference');
  profile.setSaved(p, slug, true);
  assert.equal(profile.saved(p)[0]!.slug, slug);
  assert.equal(profile.isSaved(p, slug), true);
  profile.setSaved(p, slug, false);
  assert.equal(profile.saved(p).length, 0);
  assert.throws(() => profile.setSaved(p, 'no-such-conference', true), /not found/i);
});

test('social links accept handles and links, refuse other sites and bad schemes', () => {
  const r = profile.saveProfileExtras(p, { socials: { instagram: '@mira.mun', linkedin: 'linkedin.com/in/mira', x: '', website: 'mira.example.com' }, bio: 'Six MUNs.', headline: 'Delegate' });
  assert.equal(r.socials.instagram, 'https://www.instagram.com/mira.mun');
  assert.equal(r.socials.linkedin, 'https://linkedin.com/in/mira');
  assert.equal(r.socials.website, 'https://mira.example.com/');
  assert.equal(r.socials.x, undefined);
  assert.throws(() => profile.saveProfileExtras(p, { socials: { linkedin: 'https://evil.example.com/in/mira' } }), /Use a LinkedIn link/);
  assert.throws(() => profile.saveProfileExtras(p, { socials: { website: 'javascript:alert(1)' } }), /doesn't look right|Use a/);
});

test('the MUN CV: add, edit and remove entries; dates are checked', () => {
  const { id } = profile.addCv(p, { kind: 'mun', title: 'DPS MUN 2026', role: 'France, UNSC · Best Delegate', start: '2026-08', end: '2026-08' });
  profile.addCv(p, { kind: 'eb', title: 'Springdales MUN', role: 'Vice-Chair, DISEC', start: '2026-03' });
  let c = profile.cv(people.peopleDb().prepare('SELECT * FROM person WHERE id = ?').get(p.id) as any);
  assert.equal(c.manual.length, 2);
  profile.updateCv(p, id, { kind: 'award', title: 'DPS MUN 2026', role: 'Best Delegate' });
  c = profile.cv(p);
  assert.ok(c.manual.some((e: any) => e.kind === 'award'));
  assert.throws(() => profile.addCv(p, { title: '' }), /Add a title/);
  assert.throws(() => profile.addCv(p, { title: 'X', start: '2026-09', end: '2026-01' }), /end is before/);
  assert.throws(() => profile.addCv(p, { title: 'X', start: 'last summer' }), /Dates look like/);
  profile.removeCv(p, id);
  assert.equal(profile.cv(p).manual.length, 1);
});
