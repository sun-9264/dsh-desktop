// setup-preload.js — 给安装引导页安全暴露 IPC（不开启 nodeIntegration）
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('installApi', {
  openDownload: function () { ipcRenderer.send('open-node-download'); },
  retry: function () { ipcRenderer.send('retry-check'); }
});
