const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aeDesktop', {
  getRenderPath: () => ipcRenderer.invoke('render-path:get'),
  pickRenderPath: () => ipcRenderer.invoke('render-path:pick'),
  resetRenderPath: () => ipcRenderer.invoke('render-path:reset'),
});
