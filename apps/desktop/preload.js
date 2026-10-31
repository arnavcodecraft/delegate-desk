// The only bridge from the website to the app: which app this is, and saving the server address. Nothing else.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('DD_NATIVE', 'desktop');
contextBridge.exposeInMainWorld('dd', { setServer: (url) => ipcRenderer.send('dd:set-server', String(url || '')), server: () => ipcRenderer.invoke('dd:server') });
