const { app, BrowserWindow, ipcMain, systemPreferences, shell, dialog } = require('electron');
const path = require('node:path');
const { scanForHelpers } = require('./detector');
const { createLocalServer } = require('./server');
const { createHeartbeatSender } = require('./heartbeat');
const { createStatusTray } = require('./tray');

if (require('electron-squirrel-startup')) {
  app.quit();
}

const PROTOCOL = 'enteam-interview';
const POLL_INTERVAL_MS = 3000;

let mainWindow = null;
let tray = null;
let pollHandle = null;
let sessionToken = null;
let lastScanResult = null;
let isQuitting = false;

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  return;
}

function parseTokenFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.searchParams.get('token');
  } catch {
    return null;
  }
}

function parseDeepLinkFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  const deepLink = argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${PROTOCOL}://`));
  return deepLink || null;
}

function applyIncomingDeepLink(url) {
  const token = parseTokenFromUrl(url);
  if (token) {
    sessionToken = token;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('session-token', token);
    }
    if (heartbeat && !heartbeat.isRunning()) {
      heartbeat.start();
    }
  }
}

async function runScanAndPush(win) {
  try {
    const result = await scanForHelpers();
    lastScanResult = result;
    if (win && !win.isDestroyed()) {
      win.webContents.send('scan-result', result);
    }
    if (tray) tray.update(result);
  } catch (err) {
    const errorResult = {
      clean: false,
      detections: [],
      error: String(err?.message || err),
      scannedAt: new Date().toISOString(),
    };
    lastScanResult = errorResult;
    if (win && !win.isDestroyed()) {
      win.webContents.send('scan-result', errorResult);
    }
    if (tray) tray.update(errorResult);
  }
}

async function ensureMacScreenRecordingPermission() {
  if (process.platform !== 'darwin') return { ok: true };

  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'granted') return { ok: true };

  const choice = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording permission required',
    message: 'Enteam Interview Monitor needs Screen Recording permission',
    detail:
      'Without this permission, we can only detect known processes — not overlay windows that AI helper tools use.\n\n' +
      'Click "Open Settings" to grant permission, then fully quit and relaunch this app.',
    buttons: ['Open Settings', 'Continue without it'],
    defaultId: 0,
    cancelId: 1,
  });

  if (choice.response === 0) {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    return { ok: false, pendingRelaunch: true };
  }
  return { ok: false, pendingRelaunch: false };
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 560,
    show: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (sessionToken) {
      mainWindow.webContents.send('session-token', sessionToken);
    }
    if (lastScanResult) {
      mainWindow.webContents.send('scan-result', lastScanResult);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function quitApp() {
  isQuitting = true;
  if (heartbeat) heartbeat.stop();
  if (tray) tray.destroy();
  app.quit();
}

ipcMain.handle('scan-now', async () => {
  const result = await scanForHelpers();
  lastScanResult = result;
  if (tray) tray.update(result);
  return result;
});

ipcMain.handle('get-session-token', () => sessionToken);

ipcMain.handle('get-last-scan', () => lastScanResult);

app.on('second-instance', (_event, argv) => {
  const deepLink = parseDeepLinkFromArgv(argv);
  if (deepLink) applyIncomingDeepLink(deepLink);
  showMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  applyIncomingDeepLink(url);
  showMainWindow();
});

const localServer = createLocalServer({
  getLastScan: () => lastScanResult,
  getSessionToken: () => sessionToken,
});

const heartbeat = createHeartbeatSender({
  getSessionToken: () => sessionToken,
  getLastScan: () => lastScanResult,
  onStatus: ({ ok, consecutiveFailures }) => {
    if (!ok && consecutiveFailures >= 3) {
      console.warn(`[heartbeat] ${consecutiveFailures} consecutive failures — backend unreachable?`);
    }
  },
});

app.whenReady().then(async () => {
  const deepLink = parseDeepLinkFromArgv(process.argv);
  if (deepLink) applyIncomingDeepLink(deepLink);

  await ensureMacScreenRecordingPermission();

  localServer.start();

  tray = createStatusTray({
    onShow: showMainWindow,
    onQuit: quitApp,
  });

  if (process.platform === 'darwin' && app.isPackaged) {
    app.dock.hide();
  }

  createWindow();

  pollHandle = setInterval(() => runScanAndPush(mainWindow), POLL_INTERVAL_MS);
  runScanAndPush(mainWindow);

  if (sessionToken) {
    heartbeat.start();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('before-quit', async () => {
  isQuitting = true;
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  if (heartbeat) heartbeat.stop();
  await localServer.stop();
});

app.on('window-all-closed', () => {
  // Deliberately NOT quitting on all-windows-closed — the tray is the app's
  // persistent presence. Only quit when the user explicitly picks "Quit monitor"
  // from the tray menu, or the OS asks us to (before-quit handler).
});
