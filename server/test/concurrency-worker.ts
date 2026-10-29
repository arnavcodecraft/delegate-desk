// Child process: registers N delegates as fast as possible against a shared database file.
process.env.JOBS = 'off';
const [file, eventId, committeeId, n, tag] = process.argv.slice(2);
const { openDb } = await import('../src/db.ts');
const { asSystem } = await import('../src/util.ts');
const { register } = await import('../src/services/registrations.ts');
openDb(file);
let ok = 0, fail = 0; const errors: string[] = [];
for (let i = 0; i < Number(n); i++) {
  try {
    asSystem(() => register(eventId, { full_name: `Load ${tag}-${i}`, email: `load-${tag}-${i}@example.com`, mobile: `7${String(tag).padStart(2, '0')}${String(i).padStart(7, '0')}`, institution: `Inst ${tag}`, class_year: '12', city: 'X', dob: '2005-01-01', preferences: [committeeId], consent: true, mun_count: 5 }));
    ok++;
  } catch (e: any) { fail++; errors.push(e.message); }
}
process.stdout.write(JSON.stringify({ ok, fail, errors: errors.slice(0, 3) }));
export {};
