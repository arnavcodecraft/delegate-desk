import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import './helpers.ts';
import { newState, apply, createSession, chairAction, view, exportMarks, type LiveState, type Action } from '../src/services/live.ts';
import { marksheet } from '../src/services/marking.ts';

const names = ['Latvia', 'Denmark', 'Greece', 'China', 'Pakistan', 'India'];
const run = (s: LiveState, ...as: Action[]) => as.reduce(apply, s);
const id = (s: LiveState, n: string) => s.delegates.find((d) => d.name === n)!.id;

function session() {
  let s = newState({ name: 'Security Council', delegates: names.map((name) => ({ name })) });
  s = run(s, { type: 'eb_enable' }, { type: 'roll_call', on: true }, { type: 'mark_all', presence: 'present_voting' });
  s = run(s, { type: 'presence', delegateId: id(s, 'India'), presence: 'present' }, { type: 'roll_call', on: false });
  return s;
}

test('roll call records the day\'s attendance as P / PV', () => {
  const s = session();
  assert.equal(s.marking!.attendance['1'][id(s, 'Latvia')], 'PV');
  assert.equal(s.marking!.attendance['1'][id(s, 'India')], 'P');
});

test('GSL and moderated caucuses become marksheet columns and totals follow the Verbatim 80 / Chits 20 scheme', () => {
  let s = session();
  // The speakers list opens the GSL; each speaker on the floor is a speech to mark.
  s = run(s, { type: 'motion_add', motionType: 'open_debate', proposer: id(s, 'China'), speakingTime: 90 });
  s = run(s, { type: 'motion_vote', motionId: s.motions[0].id });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: 'for' });
  s = run(s, { type: 'vote_close' }, { type: 'speaker_add', delegateId: id(s, 'Latvia') }, { type: 'speaker_add', delegateId: id(s, 'Denmark') }, { type: 'speaker_next' });
  assert.equal(s.marking!.segments[0].column, 'GSL');
  assert.equal(s.marking!.speeches.length, 1);
  const lat = s.marking!.speeches[0].id;
  s = run(s, { type: 'eb_speech', speechId: lat, score: 4.8, notes: 'Article 1(1) and 2(3) of the UN Charter' });
  s = run(s, { type: 'eb_poi', by: id(s, 'Greece'), score: 0.3, notes: 'Asked about IAEA' });
  s = run(s, { type: 'speaker_next' });
  s = run(s, { type: 'eb_speech', speechId: s.marking!.speeches[1].id, score: 5 });
  // A moderated caucus passing opens MOD-1 with its topic.
  s = run(s, { type: 'motion_add', motionType: 'moderated', proposer: id(s, 'Denmark'), duration: 900, speakingTime: 60, topic: 'De-escalating US–Iran tensions' });
  s = run(s, { type: 'motion_vote', motionId: s.motions[1].id });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: 'for' });
  s = run(s, { type: 'vote_close' });
  const mod = s.marking!.segments.at(-1)!;
  assert.equal(mod.column, 'MOD-1'); assert.equal(mod.topic, 'De-escalating US–Iran tensions');
  s = run(s, { type: 'eb_recognise', delegateId: id(s, 'Latvia') });
  assert.equal(s.speakers.current, id(s, 'Latvia'));
  assert.equal(s.timer.duration, 60, 'the caucus speaking time');
  s = run(s, { type: 'eb_speech', speechId: s.marking!.speeches.at(-1)!.id, score: 5 });
  s = run(s, { type: 'eb_poi', by: id(s, 'Latvia'), score: 0.5 }, { type: 'eb_poi', by: id(s, 'Latvia'), score: 0.4 });
  s = run(s, { type: 'eb_chit', kind: 'substantive', by: id(s, 'Latvia'), score: 9.4 }, { type: 'eb_chit', kind: 'poi', by: id(s, 'Latvia'), score: 3.6 });
  s = run(s, { type: 'eb_manual', delegateId: id(s, 'Latvia'), key: 'lobbying', value: 3 }, { type: 'eb_manual', delegateId: id(s, 'Latvia'), key: 'documentation', value: 3 });

  const ms = marksheet(s)!;
  assert.deepEqual(ms.columns, ['GSL', 'MOD-1']);
  const latvia = ms.rows.find((r) => r.portfolio === 'Latvia')!;
  // Verbatim = (4.8 + 5 + 0.5 + 0.4) × 0.8 = 8.56; Chits = (9.4 + 3.6) × 0.2 = 2.6; + 3 + 3
  assert.equal(latvia.groups.verbatim.weighted, 8.56);
  assert.equal(latvia.groups.chits.weighted, 2.6);
  assert.equal(latvia.total, 17.16);
  assert.equal(latvia.rank, 1); assert.equal(latvia.award, 'Best Delegate');
  assert.throws(() => apply(s, { type: 'eb_speech', speechId: lat, score: 11 }), /between 0 and 10/);
  assert.throws(() => apply(s, { type: 'eb_manual', delegateId: id(s, 'Latvia'), key: 'lobbying', value: 6 }), /between 0 and 5/);
});

test('marks stay private to the chair and export as the three EB sheets', async () => {
  const { code, chairKey } = createSession({ name: 'UNSC', delegates: names.map((name) => ({ name })) });
  let v: any = chairAction(code, chairKey, { type: 'eb_enable' });
  const lat = v.delegates.find((d: any) => d.name === 'Latvia').id;
  chairAction(code, chairKey, { type: 'eb_segment', kind: 'gsl' });
  v = chairAction(code, chairKey, { type: 'eb_recognise', delegateId: lat });
  chairAction(code, chairKey, { type: 'eb_speech', speechId: v.marking.speeches[0].id, score: 4.5, notes: 'Strong opening' });
  const pub: any = view(code);
  assert.equal(pub.marking, undefined); assert.equal(pub.marksheet, undefined);
  assert.ok((view(code, { chairKey }) as any).marksheet);
  assert.throws(() => chairAction(code, 'wrong', { type: 'eb_speech', speechId: v.marking.speeches[0].id, score: 10 }), /Only the chair/);
  const { file } = await exportMarks(code, chairKey);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(file as any);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['MARKSHEET', 'VERBATIM', 'RECOGNITION SHEET']);
  const head = (wb.getWorksheet('MARKSHEET')!.getRow(1).values as any[]).filter(Boolean);
  assert.ok(head.includes('GSL') && head.includes('VERBATIM (80%)') && head.includes('TOTAL'));
  const vrows = wb.getWorksheet('VERBATIM')!.getSheetValues().flat().filter(Boolean);
  assert.ok(vrows.includes('Strong opening'));
  await assert.rejects(exportMarks(code, 'nope'), /Only the chair/);
});
