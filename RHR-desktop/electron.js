const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// app.isPackaged is false when running via `electron .` / electron-launcher.js
// in dev, and true once electron-builder has packaged the app — no extra
// dependency (e.g. electron-is-dev) needed.
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#F4F1EC',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3001';
    win.loadURL(startUrl);
  } else {
    win.loadFile(path.join(__dirname, 'build', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Chromium blocks geolocation by default in Electron — the admin
  // location feature needs this granted for navigator.geolocation to work.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'geolocation');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
