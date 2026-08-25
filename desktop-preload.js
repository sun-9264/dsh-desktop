// desktop-preload.js — 给 DSH 页面暴露桌面级设置（开机自启 / 记住窗口大小 / 主屏居中），走 IPC 到 Electron 主进程
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopSetup', {
  get: function () { return ipcRenderer.sendSync('desktop-get'); },
  setAutoLaunch: function (val) { ipcRenderer.send('desktop-set', 'autoLaunch', !!val); },
  setRememberSize: function (val) { ipcRenderer.send('desktop-set', 'rememberSize', !!val); }
});
