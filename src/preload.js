const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('detectorAPI', {
  onScanResult: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('scan-result', listener);
    return () => ipcRenderer.removeListener('scan-result', listener);
  },
  onSessionToken: (callback) => {
    const listener = (_event, token) => callback(token);
    ipcRenderer.on('session-token', listener);
    return () => ipcRenderer.removeListener('session-token', listener);
  },
  getSessionToken: () => ipcRenderer.invoke('get-session-token'),
  getLastScan: () => ipcRenderer.invoke('get-last-scan'),
  scanNow: () => ipcRenderer.invoke('scan-now'),
});
