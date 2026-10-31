/**
 * Deletes every conference, workspace, account and upload on this machine, so DelegateDesk starts empty.
 * Stop the server first, then:  npm run reset -- --yes
 * (It only touches the data folder. A backup copy is kept in data-backup-<time> unless you add --no-backup.)
 */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data = process.env.DB_PATH ? path.dirname(path.resolve(process.env.DB_PATH)) : path.join(root, 'data');
const args = process.argv.slice(2);
if (!args.includes('--yes')) {
  console.log(`This deletes ALL conferences, accounts and uploads in ${data}.\nStop the server, then run:  npm run reset -- --yes`);
  process.exit(1);
}
if (!fs.existsSync(data)) { console.log('Nothing to reset: there is no data folder yet.'); process.exit(0); }
if (!args.includes('--no-backup')) {
  const copy = path.join(path.dirname(data), `data-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.cpSync(data, copy, { recursive: true });
  console.log(`Backup saved to ${copy}`);
}
for (const f of fs.readdirSync(data)) fs.rmSync(path.join(data, f), { recursive: true, force: true });
console.log('Done. DelegateDesk will start empty: list your first conference at /list.');
