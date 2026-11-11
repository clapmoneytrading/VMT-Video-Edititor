const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aeDesktop', {
  getRenderPath: () => ipcRenderer.invoke('render-path:get'),
  pickRenderPath: () => ipcRenderer.invoke('render-path:pick'),
  resetRenderPath: () => ipcRenderer.invoke('render-path:reset'),
  getLastProjectFilePath: () => ipcRenderer.invoke('project-file:get-last-path'),
  saveProjectFile: (path, content) => ipcRenderer.invoke('project-file:save', { path, content }),
  saveProjectFileAs: (defaultName, content) => ipcRenderer.invoke('project-file:save-as', { defaultName, content }),
  openProjectFile: () => ipcRenderer.invoke('project-file:open'),
});
