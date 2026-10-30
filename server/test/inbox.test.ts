import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';
import { all } from '../src/db.ts';

const inbox = await import('../src/services/inbox.ts');
before(() => { freshDb(); });

test('contact messages and service requests reach the inbox; the sender gets an acknowledgement', () => {
  inbox.contact({ name: 'Rohan Gupta', email: 'rohan@example.com', topic: 'organiser', message: 'We want to run our school MUN on DelegateDesk.' });
  inbox.requestService({ service: 'eb', name: 'Priya Nair', email: 'priya@school.example', organisation: 'Springdales', conference: 'SMUN 2027', size: '6', when: 'January' });
  const list = inbox.inbox('new');
  assert.equal(list.length, 2);
  const svc = list.find((m) => m.kind === 'service')!;
  assert.equal(svc.topic_label, 'EB support');
  assert.deepEqual(svc.details, { when: 'January', size: '6', conference: 'SMUN 2027' });
  assert.ok(all("SELECT 1 FROM notification WHERE template_key = 'inbox_received'").length >= 2, 'both senders are acknowledged');
  inbox.markHandled(svc.id, true, 'Called back');
  assert.equal(inbox.newCount(), 1);
  assert.throws(() => inbox.contact({ name: 'R', email: 'bad', message: 'short' }), /highlighted fields/);
  assert.throws(() => inbox.requestService({ service: 'nope', name: 'Asha', email: 'a@b.co' }), /Choose a service/);
  assert.deepEqual(inbox.contact({ website: 'spam', name: 'Bot', email: 'bot@x.com', message: 'buy now buy now' }), { id: 'ok' }, 'bots are quietly ignored');
  assert.equal(inbox.inbox().length, 2);
});
