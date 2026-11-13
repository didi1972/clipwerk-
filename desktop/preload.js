const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  desktop: true,
  fetch: (url, opts) => ipcRenderer.invoke('net:fetch', url, opts),
  saveAuto: (name, data) => ipcRenderer.invoke('file:saveAuto', name, data),
  saveAs: (name, data) => ipcRenderer.invoke('file:saveAs', name, data),
  show: (p) => ipcRenderer.invoke('file:show', p),
  openVideos: () => ipcRenderer.invoke('file:openVideos'),
  version: () => ipcRenderer.invoke('app:version'),
});
