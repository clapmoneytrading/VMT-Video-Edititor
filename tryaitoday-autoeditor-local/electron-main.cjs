const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PREFERRED_PORT = Number(process.env.PORT) || 3000;
let URL = '';
let renderSaveDir = null;
let lastProjectFilePath = null;

function prefsPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPrefs() {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf8');
    const p = JSON.parse(raw || '{}');
    if (p && typeof p.renderSaveDir === 'string' && p.renderSaveDir.trim()) {
      renderSaveDir = p.renderSaveDir;
    }
    if (p && typeof p.lastProjectFilePath === 'string' && p.lastProjectFilePath.trim()) {
      lastProjectFilePath = p.lastProjectFilePath;
    }
  } catch (_) {
    // Keep defaults when no preferences file exists yet.
  }
}

function savePrefs() {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(
      prefsPath(),
      JSON.stringify({ renderSaveDir: renderSaveDir || '', lastProjectFilePath: lastProjectFilePath || '' }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Could not save preferences:', err && err.message ? err.message : err);
  }
}

function getEffectiveRenderSaveDir() {
  return renderSaveDir || app.getPath('downloads');
}

function isRenderedVideo(name, mime) {
  const n = String(name || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|mkv|avi)$/i.test(n);
}

function registerIpc() {
  ipcMain.handle('render-path:get', () => ({
    path: getEffectiveRenderSaveDir(),
    isDefault: !renderSaveDir,
  }));

  ipcMain.handle('render-path:pick', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showOpenDialog(win || undefined, {
      title: 'Choose render output folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getEffectiveRenderSaveDir(),
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) {
      return { canceled: true, path: getEffectiveRenderSaveDir(), isDefault: !renderSaveDir };
    }
    renderSaveDir = res.filePaths[0];
    savePrefs();
    return { canceled: false, path: getEffectiveRenderSaveDir(), isDefault: false };
  });

  ipcMain.handle('render-path:reset', () => {
    renderSaveDir = null;
    savePrefs();
    return { path: getEffectiveRenderSaveDir(), isDefault: true };
  });

  ipcMain.handle('project-file:get-last-path', () => ({ path: lastProjectFilePath || '' }));

  ipcMain.handle('project-file:save', async (_event, arg) => {
    const filePath = arg && typeof arg.path === 'string' ? arg.path : '';
    const content = arg && typeof arg.content === 'string' ? arg.content : '';
    if (!filePath || !content) return { ok: false, message: 'Missing file path or content.' };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    lastProjectFilePath = filePath;
    savePrefs();
    return { ok: true, path: filePath };
  });

  ipcMain.handle('project-file:save-as', async (_event, arg) => {
    const win = BrowserWindow.getFocusedWindow();
    const content = arg && typeof arg.content === 'string' ? arg.content : '';
    const defaultName = (arg && typeof arg.defaultName === 'string' && arg.defaultName.trim()) || 'project.autoedit.json';
    if (!content) return { canceled: true, message: 'No project content to save.' };
    const res = await dialog.showSaveDialog(win || undefined, {
      title: 'Save AutoEditor project',
      defaultPath: lastProjectFilePath || path.join(app.getPath('downloads'), defaultName),
      filters: [{ name: 'AutoEditor project', extensions: ['autoedit.json', 'json'] }, { name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    fs.mkdirSync(path.dirname(res.filePath), { recursive: true });
    fs.writeFileSync(res.filePath, content, 'utf8');
    lastProjectFilePath = res.filePath;
    savePrefs();
    return { canceled: false, path: res.filePath };
  });

  ipcMain.handle('project-file:open', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showOpenDialog(win || undefined, {
      title: 'Open AutoEditor project',
      properties: ['openFile'],
      defaultPath: lastProjectFilePath || app.getPath('downloads'),
      filters: [{ name: 'AutoEditor project', extensions: ['autoedit.json', 'json'] }, { name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return { canceled: true };
    const filePath = res.filePaths[0];
    const text = fs.readFileSync(filePath, 'utf8');
    lastProjectFilePath = filePath;
    savePrefs();
    return { canceled: false, path: filePath, text };
  });
}

function tryListen(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(null));
    probe.listen(port, '127.0.0.1', () => {
      const actual = probe.address().port;
      probe.close(() => resolve(actual));
    });
  });
}

// Prefer 3000 so saved browser data keeps the same origin; fall back to a free port if busy.
async function pickPort() {
  return (await tryListen(PREFERRED_PORT)) || (await tryListen(0));
}

function waitForServer(retries, done) {
  http
    .get(`${URL}healthz`, (res) => {
      res.resume();
      done();
    })
    .on('error', () => {
      if (retries <= 0) return done(new Error('Local server did not start'));
      setTimeout(() => waitForServer(retries - 1, done), 200);
    });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'TryAIToday AutoEditor',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Project files (Save project file) open a native save dialog so the user picks the local location.
  win.webContents.session.on('will-download', (event, item) => {
    const name = item.getFilename();
    if (name.endsWith('.autoedit.json')) {
      item.setSaveDialogOptions({
        title: 'Save AutoEditor project',
        defaultPath: name,
        filters: [{ name: 'AutoEditor project', extensions: ['json'] }],
      });
      return;
    }

    if (isRenderedVideo(name, item.getMimeType && item.getMimeType())) {
      item.setSavePath(path.join(getEffectiveRenderSaveDir(), name));
    }
  });

  win.loadURL(`${URL}editor`);
}

app.whenReady().then(async () => {
  loadPrefs();
  registerIpc();
  const port = await pickPort();
  if (!port) {
    console.error('No free local port available');
    app.quit();
    return;
  }
  URL = `http://127.0.0.1:${port}/`;
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  require('./server.js');

  waitForServer(50, (err) => {
    if (err) {
      console.error(err);
      app.quit();
      return;
    }
    createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
