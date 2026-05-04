const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

function staffHtmlPath() {
  return path.join(__dirname, '..', 'dist-staff', 'staff.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
    },
  });

  const argv = process.argv;
  const forceVite = argv.includes('--dev') || argv.includes('-d');
  const hasStaffBuild = fs.existsSync(staffHtmlPath());
  const useVite = forceVite || (!app.isPackaged && !hasStaffBuild);

  if (useVite) {
    win.loadURL('http://127.0.0.1:5173/staff.html');
  } else {
    win.loadFile(staffHtmlPath());
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
