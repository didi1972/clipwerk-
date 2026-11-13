const { app, BrowserWindow, ipcMain, net, dialog, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Clipwerk Studio');
if (process.platform === 'win32') app.setAppUserModelId('de.clipwerk.studio');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640,
    title: 'Clipwerk Studio', backgroundColor: '#0c0d11', show: false,
    icon: path.join(__dirname, 'icon.ico'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'index.html'));
  // Links (z. B. Schlüssel holen) im System öffnen, nie neue App-Fenster
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  // Mikrofon für Sprachaufnahme erlauben
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'notifications'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler(() => true);
  createWindow();
});
app.on('window-all-closed', () => app.quit());

/* Internetzugriff ohne Browser-Sperren (CORS) – für freie Medien und KI-Dienste */
ipcMain.handle('net:fetch', async (e, url, opts = {}) => {
  if (!/^https:\/\//.test(url)) throw new Error('Nur https-Adressen erlaubt');
  const headers = { 'User-Agent': 'ClipwerkStudio/1.2 (Desktop-Videoeditor)', ...(opts.headers || {}) };
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), opts.timeout || 120000);
  try {
    const r = await net.fetch(url, { method: opts.method || 'GET', headers, body: opts.body, signal: ctrl.signal, redirect: 'follow' });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type') || '', data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } finally { clearTimeout(to); }
});

/* Dateien speichern */
function videosDir() { const d = path.join(app.getPath('videos'), 'Clipwerk'); fs.mkdirSync(d, { recursive: true }); return d; }
function freeName(dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext).replace(/[\\/:*?"<>|]+/g, '').trim() || 'video';
  let p = path.join(dir, base + ext), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
ipcMain.handle('file:saveAuto', async (e, name, data) => { const p = freeName(videosDir(), name); fs.writeFileSync(p, Buffer.from(data)); return p; });
ipcMain.handle('file:saveAs', async (e, name, data) => {
  const ext = path.extname(name).slice(1) || '*';
  const r = await dialog.showSaveDialog(win, { defaultPath: freeName(ext === 'mp4' || ext === 'webm' ? videosDir() : app.getPath('documents'), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'Alle Dateien', extensions: ['*'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data)); return r.filePath;
});
ipcMain.handle('file:show', (e, p) => { shell.showItemInFolder(p); });
ipcMain.handle('file:openVideos', () => shell.openPath(videosDir()));
ipcMain.handle('app:version', () => app.getVersion());
