// DelegateDesk desktop. The whole website ships inside the app (web/), so it opens straight onto the home page.
// Server calls (/api, /uploads) are passed on to the DelegateDesk server, set at build time (settings.json, APP_URL)
// or in App settings, and the sign-in cookies stay in the app's own session.
const { app, BrowserWindow, Menu, shell, ipcMain, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const WEB = path.join(__dirname, 'web');
const ORIGIN = 'app://delegatedesk';
const userFile = () => path.join(app.getPath('userData'), 'settings.json');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const serverUrl = () => (read(userFile()).url || read(path.join(__dirname, 'settings.json')).url || '').replace(/\/+$/, '');
const origin = (u) => { try { return new URL(u).origin; } catch { return null; } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' };

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

async function handle(req) {
  const u = new URL(req.url);
  if (/^\/(api|uploads)\//.test(u.pathname)) {
    const base = serverUrl();
    if (!base) return new Response(JSON.stringify({ error: 'This app is not connected to a DelegateDesk server yet. Open the DelegateDesk menu, then App settings.' }), { status: 503, headers: { 'content-type': 'application/json' } });
    const headers = new Headers(req.headers); headers.delete('origin'); headers.delete('referer');
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    return session.defaultSession.fetch(base + u.pathname + u.search, { method: req.method, headers, body: hasBody ? req.body : undefined, duplex: hasBody ? 'half' : undefined, credentials: 'include', redirect: 'follow' });
  }
  // The website's files; any other path is a page of the site, so it gets index.html.
  let file = path.normalize(path.join(WEB, decodeURIComponent(u.pathname)));
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB, 'index.html');
  const body = fs.readFileSync(file);
  return new Response(body, { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' } });
}

let win;
const home = () => win.loadURL(`${ORIGIN}/`);
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 560, title: 'DelegateDesk', backgroundColor: '#060b18', show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  // Links to other sites open in the person's browser (payment pages stay in the window).
  // (new URL() gives custom schemes a "null" origin, so compare the start of the address.)
  const inside = (url) => url === ORIGIN || url.startsWith(`${ORIGIN}/`) || /razorpay|cashfree/.test(url);
  win.webContents.setWindowOpenHandler(({ url }) => { if (inside(url)) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!inside(url)) { e.preventDefault(); shell.openExternal(url); } });
  home();
}

ipcMain.on('dd:set-server', (_e, url) => {
  const o = url ? origin(url) : '';
  if (o === null) return;
  fs.mkdirSync(path.dirname(userFile()), { recursive: true });
  fs.writeFileSync(userFile(), JSON.stringify({ url: o }));
});
ipcMain.handle('dd:server', () => serverUrl());

function menu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'DelegateDesk', submenu: [
      { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => home() },
      { label: 'App settings…', click: () => win.loadURL(`${ORIGIN}/app-settings`) },
      { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Navigate', submenu: [
      { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: () => win?.webContents.navigationHistory?.goBack?.() ?? win?.webContents.goBack() },
      { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: () => win?.webContents.navigationHistory?.goForward?.() ?? win?.webContents.goForward() },
    ] },
    { role: 'windowMenu' },
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', handle);
    menu(); createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
