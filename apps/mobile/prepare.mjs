// Builds the Android app's local files: the whole DelegateDesk website (from the root `npm run build`), so the app
// opens straight onto the home page, plus capacitor.config.json.
// APP_URL (optional) is the DelegateDesk server the app talks to; without it, people add one in App settings.
import fs from 'node:fs';
import path from 'node:path';
const here = import.meta.dirname;
const dist = path.join(here, '..', '..', 'web', 'dist');
const www = path.join(here, 'www');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build the website first: run `npm run build` in the repository root.');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(dist, www, { recursive: true });
const url = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
if (url && !/^https:\/\//.test(url)) throw new Error('APP_URL must start with https://');
// Tell the website it is running in the Android app, and which server to use.
const index = path.join(www, 'index.html');
const boot = `<script>window.DD_NATIVE='android';window.DD_API=${JSON.stringify(url)};</script>`;
fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('<head>', `<head>${boot}`));
const config = {
  appId: 'app.delegatedesk.mobile',
  appName: 'DelegateDesk',
  webDir: 'www',
  server: { androidScheme: 'https' },
  // Server calls go through native HTTP: no CORS, and the sign-in cookies are kept like in a browser.
  plugins: { CapacitorHttp: { enabled: true }, CapacitorCookies: { enabled: true }, SplashScreen: { launchShowDuration: 900, backgroundColor: '#060b18' } },
  android: { allowMixedContent: false, backgroundColor: '#060b18' },
};
fs.writeFileSync(path.join(here, 'capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`www ready (the website, opening on the home page); server: ${url || 'set in App settings'}`);
