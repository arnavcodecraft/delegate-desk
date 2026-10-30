// Before the server starts: rebuild the website if its source is newer than the built copy (or there is none),
// so pulling new code never leaves an old site running. A fresh Docker/Render build is already up to date and skips this.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const built = path.join(root, 'web', 'dist', 'index.html');
const newest = (p) => {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  return Math.max(0, ...fs.readdirSync(p).map((f) => newest(path.join(p, f))));
};
const source = Math.max(newest(path.join(root, 'web', 'src')), newest(path.join(root, 'web', 'public')), newest(path.join(root, 'web', 'index.html')));
const have = fs.existsSync(built) ? fs.statSync(built).mtimeMs : 0;
if (have >= source) process.exit(0);
console.log(have ? 'The website changed since it was last built: rebuilding (about 30 seconds)…' : 'Building the website (first run, about 30 seconds)…');
try { execSync('npm run build', { cwd: root, stdio: 'inherit' }); }
catch { console.error('Building the website failed. Run "npm install" and then "npm run build" to see why.'); process.exit(1); }
