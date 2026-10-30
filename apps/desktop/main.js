// DelegateDesk desktop: a window onto the organiser's DelegateDesk site, with its own icon and menu.
// The site address comes from the build (settings.json, APP_URL) or from the start screen, saved per user.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const userFile = () => path.join(app.getPath('userData'), 'settings.json');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const builtIn = () => read(path.join(__dirname, 'settings.json')).url || '';
const serverUrl = () => builtIn() || read(userFile()).url || '';
const origin = (u) => { try { return new URL(u).origin; } catch { return null; } };

let win;
function openShell(change = false) { win.loadFile(path.join(__dirname, 'shell', 'index.html'), change ? { search: 'change=1' } : undefined); }
function openSite() { const u = serverUrl(); if (u) win.loadURL(u); else openShell(); }

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 560, title: 'DelegateDesk', backgroundColor: '#f6f8fc', show: false,
    icon: path.join(__dirname, 'shell', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  // Links to other sites (payment pages excepted, which stay in the window) open in the person's browser.
  const keep = (url) => { const o = origin(url); return o === origin(serverUrl()) || /razorpay|cashfree/.test(url) || url.startsWith('file:'); };
  win.webContents.setWindowOpenHandler(({ url }) => { if (keep(url) && origin(url) === origin(serverUrl())) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!keep(url)) { e.preventDefault(); shell.openExternal(url); } });
  // No internet or a wrong address: show a clear message instead of a blank window.
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    dialog.showMessageBox(win, { type: 'warning', title: 'Can’t reach DelegateDesk', message: 'DelegateDesk could not be reached.', detail: `${desc} (${url}). Check your internet connection, or change the site address.`, buttons: ['Try again', 'Change address', 'Close'] })
      .then(({ response }) => { if (response === 0) openSite(); else if (response === 1) openShell(true); });
  });
  openSite();
}

ipcMain.on('dd:set-server', (_e, url) => {
  const o = origin(url);
  if (!o) return;
  fs.mkdirSync(path.dirname(userFile()), { recursive: true });
  fs.writeFileSync(userFile(), JSON.stringify({ url: o }));
  openSite();
});

function menu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'DelegateDesk', submenu: [
      { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => openSite() },
      { label: 'Change site address…', enabled: !builtIn(), click: () => openShell(true) },
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
  app.whenReady().then(() => { menu(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
