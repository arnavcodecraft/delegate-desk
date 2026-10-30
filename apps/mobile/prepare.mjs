// Builds the Android app's local files: the start screen from apps/shell, and capacitor.config.json.
// APP_URL (optional) makes the app open that DelegateDesk site directly instead of asking for it.
import fs from 'node:fs';
import path from 'node:path';
const here = import.meta.dirname;
const www = path.join(here, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(here, '..', 'shell'), www, { recursive: true });
const url = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
if (url && !/^https:\/\//.test(url)) throw new Error('APP_URL must start with https://');
fs.writeFileSync(path.join(www, 'config.js'), `window.DD_URL = ${JSON.stringify(url)};\n`);
const config = {
  appId: 'app.delegatedesk.mobile',
  appName: 'DelegateDesk',
  webDir: 'www',
  server: { androidScheme: 'https', allowNavigation: ['*'], ...(url ? { url } : {}) },
  android: { allowMixedContent: false, backgroundColor: '#f6f8fc' },
};
fs.writeFileSync(path.join(here, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`www ready; ${url ? `opens ${url}` : 'asks for the site address on first launch'}`);
