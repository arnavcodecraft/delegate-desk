/** Restore an encrypted backup:  npm run restore -- <file.ddbak> [target-dir]   (needs the same BACKUP_KEY) */
import path from 'node:path';
import { restoreTo } from './services/backup.ts';

const [file, target = path.resolve('restored')] = process.argv.slice(2);
if (!file) { console.error('Usage: npm run restore -- <backup.ddbak> [target-dir]'); process.exit(1); }
const m = restoreTo(path.resolve(file), target);
console.log(`Restored backup from ${m.createdAt} into ${target}: delegatedesk.db and ${m.files.length} uploaded files.`);
console.log(`Row counts at backup time: ${JSON.stringify(m.counts)}`);
console.log(`To use it: stop the app, then set DB_PATH=${path.join(target, 'delegatedesk.db')} and UPLOAD_DIR=${path.join(target, 'uploads')}.`);
