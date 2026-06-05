const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      const filePath = commandLine[commandLine.length - 1];
      if (filePath && !filePath.startsWith('--')) {
        mainWindow.webContents.send('open-initial-file', filePath);
      }
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      frame: false,
      title: 'GhostNotepad',
      titleBarStyle: 'hidden',
      transparent: false,
      backgroundColor: '#121212',
      icon: path.join(__dirname, 'notes.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    mainWindow.loadFile('index.html');
    
    let forceQuit = false;
    mainWindow.on('close', (e) => {
      if (!forceQuit) {
        e.preventDefault();
        mainWindow.webContents.send('request-close');
      }
    });

    ipcMain.on('force-close', () => {
      forceQuit = true;
      mainWindow.close();
    });
    
    mainWindow.once('ready-to-show', () => {
      mainWindow.maximize();
      mainWindow.show();
    });
    
    mainWindow.webContents.on('did-finish-load', () => {
      const args = process.argv;
      if (args.length >= 2) {
        const filePath = args[args.length - 1];
        if (filePath && filePath !== '.' && !filePath.startsWith('--')) {
          mainWindow.webContents.send('open-initial-file', filePath);
        }
      }
    });
  }

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });
}

ipcMain.on('window-min', () => mainWindow.minimize());
ipcMain.on('window-max', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.handle('dialog:showMessageBox', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options);
});

const userDataPath = app.getPath('userData');
const sessionFile = path.join(userDataPath, 'session.json');

ipcMain.handle('session:save', (event, data) => {
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(data), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('session:load', () => {
  try {
    if (fs.existsSync(sessionFile)) {
      return JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    }
  } catch (e) {}
  return null;
});

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'GhostNotepad Files', extensions: ['notes', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled) return null;
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { path: filePaths[0], content };
});

ipcMain.handle('dialog:saveFile', async (event, content, filePath) => {
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }
  const { canceled, filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'GhostNotepad Files', extensions: ['notes'] },
      { name: 'Text Files', extensions: ['txt'] }
    ]
  });
  if (canceled) return null;
  fs.writeFileSync(newPath, content, 'utf-8');
  return newPath;
});

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { path: filePath, content: content };
  } catch (e) {
    return null;
  }
});
