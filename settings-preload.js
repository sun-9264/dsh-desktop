const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('settingsApi', {
  get: function () { return ipcRenderer.sendSync('settings-get'); },
  set: function (key, val) { ipcRenderer.send('settings-set', key, val); }
});
