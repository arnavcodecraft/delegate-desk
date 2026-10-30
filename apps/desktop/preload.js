// The only bridge from web pages to the app: the start screen can save the site address. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dd', { setServer: (url) => ipcRenderer.send('dd:set-server', String(url || '')) });
