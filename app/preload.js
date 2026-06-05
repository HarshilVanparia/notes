const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content, filePath) => ipcRenderer.invoke('dialog:saveFile', content, filePath),
  openFileSpecific: (filePath) => ipcRenderer.invoke('file:read', filePath),
  showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options),
  forceClose: () => ipcRenderer.send('force-close'),
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  loadSession: () => ipcRenderer.invoke('session:load'),
  windowMin: () => ipcRenderer.send('window-min'),
  windowMax: () => ipcRenderer.send('window-max'),
  windowClose: () => ipcRenderer.send('window-close'),
  
  // Menu event handlers
  onMenuNew: (callback) => ipcRenderer.on('menu:new', () => callback()),
  onMenuOpen: (callback) => ipcRenderer.on('menu:open', () => callback()),
  onMenuSave: (callback) => ipcRenderer.on('menu:save', () => callback()),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu:saveAs', () => callback()),
  onMenuZoomIn: (callback) => ipcRenderer.on('menu:zoomIn', () => callback()),
  onMenuZoomOut: (callback) => ipcRenderer.on('menu:zoomOut', () => callback()),
  onMenuZoomReset: (callback) => ipcRenderer.on('menu:zoomReset', () => callback()),
  onRequestClose: (callback) => ipcRenderer.on('request-close', () => callback()),
  onOpenInitialFile: (callback) => ipcRenderer.on('open-initial-file', (event, filePath) => callback(filePath)),
});
