'use strict';
const { app, BrowserWindow, ipcMain, net, dialog, shell, session, Menu, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const APP_HOST = 'clipwerk';
const ROOT = __dirname;

// Eigenes, sicheres Protokoll: echte Herkunft (Origin) statt file:// → IndexedDB, Cache, OPFS und CSP funktionieren sauber.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

// Sicherheitsregel: Code (Skripte, WASM-Lader, Worker) nur aus dem Programm selbst.
// Daten (Bilder, Videos, Musik, KI-Modelle) dürfen aus dem Netz kommen.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' data: blob: https:",
  "object-src 'none'", "frame-src 'none'", "base-uri 'self'", "form-action 'none'",
].join('; ');

app.setName('Clipwerk Studio');
if (process.platform === 'win32') app.setAppUserModelId('de.clipwerk.studio');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.tflite': 'application/octet-stream', '.ico': 'image/x-icon', '.json': 'application/json' };

function serveApp() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    if (u.host !== APP_HOST) return new Response('Nicht gefunden', { status: 404 });
    const rel = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Verboten', { status: 403 });   // kein Ausbruch aus dem App-Ordner
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Nicht gefunden', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    if (rel.endsWith('.html')) headers.set('Content-Security-Policy', CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: 200, headers });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640,
    title: 'Clipwerk Studio', backgroundColor: '#0c0d11', show: false,
    icon: path.join(ROOT, 'icon.ico'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(`app://${APP_HOST}/index.html`);
  // Externe Links im Standard-Browser öffnen, nie innerhalb der App navigieren
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`app://${APP_HOST}/`)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  serveApp();
  const appOrigin = `app://${APP_HOST}`;
  // Berechtigungen nur für die eigene App: Mikrofon (Sprachaufnahme), Vollbild, Zwischenablage
  const allowed = new Set(['media', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const okOrigin = (details.requestingUrl || '').startsWith(appOrigin);
    if (perm === 'media' && details.mediaTypes && details.mediaTypes.some(t => t !== 'audio')) return cb(false);
    cb(okOrigin && allowed.has(perm));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => (origin || '').startsWith(appOrigin) && allowed.has(perm));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('web-contents-created', (e, wc) => wc.on('will-attach-webview', ev => ev.preventDefault()));

/* ---------- Internetzugriff für Daten (Medien, KI) – ohne Browser-CORS-Sperren ---------- */
const MAX_DOWNLOAD = 500 * 1024 * 1024;
// Hinweis: Node liefert für eigene Protokolle origin "null" → Protokoll und Host einzeln prüfen
const isAppSender = (e) => { try { const u = new URL(e.senderFrame.url); return u.protocol === 'app:' && u.host === APP_HOST; } catch { return false; } };
ipcMain.handle('net:fetch', async (e, url, opts = {}) => {
  if (!isAppSender(e)) throw new Error('Nicht erlaubt');
  if (typeof url !== 'string' || !/^https:\/\/[^\s]+$/.test(url)) throw new Error('Nur https-Adressen erlaubt');
  const method = ['GET', 'POST', 'HEAD'].includes(String(opts.method || 'GET').toUpperCase()) ? String(opts.method || 'GET').toUpperCase() : 'GET';
  const headers = { 'User-Agent': `ClipwerkStudio/${app.getVersion()} (Desktop-Videoeditor)` };
  for (const [k, v] of Object.entries(opts.headers || {})) if (typeof v === 'string' && /^[A-Za-z0-9-]+$/.test(k)) headers[k] = v;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), Math.min(Number(opts.timeout) || 120000, 600000));
  try {
    const r = await net.fetch(url, { method, headers, body: typeof opts.body === 'string' ? opts.body : undefined, signal: ctrl.signal, redirect: 'follow' });
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_DOWNLOAD) throw new Error('Datei ist zu groß');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > MAX_DOWNLOAD) throw new Error('Datei ist zu groß');
    return { ok: r.ok, status: r.status, type: r.headers.get('content-type') || '', data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } finally { clearTimeout(to); }
});

/* ---------- Dateien speichern ---------- */
const ALLOWED_EXT = new Set(['.mp4', '.webm', '.png', '.clipwerk', '.srt', '.wav']);
function videosDir() { const d = path.join(app.getPath('videos'), 'Clipwerk'); fs.mkdirSync(d, { recursive: true }); return d; }
function cleanName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  const base = path.basename(String(name || 'video'), ext).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/^\.+/, '').trim().slice(0, 100) || 'video';
  return { base, ext: ALLOWED_EXT.has(ext) ? ext : '.bin' };
}
function freePath(dir, name) {
  const { base, ext } = cleanName(name);
  let p = path.join(dir, base + ext), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
const toBuf = (data) => { if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) throw new Error('Ungültige Daten'); return Buffer.from(data instanceof ArrayBuffer ? data : data.buffer); };
ipcMain.handle('file:saveAuto', async (e, name, data) => {
  if (!isAppSender(e)) throw new Error('Nicht erlaubt');
  const p = freePath(videosDir(), name); await fs.promises.writeFile(p, toBuf(data)); return p;
});
ipcMain.handle('file:saveAs', async (e, name, data) => {
  if (!isAppSender(e)) throw new Error('Nicht erlaubt');
  const { ext } = cleanName(name);
  const dir = ['.mp4', '.webm'].includes(ext) ? videosDir() : app.getPath('documents');
  const r = await dialog.showSaveDialog(win, { defaultPath: freePath(dir, name), filters: [{ name: ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }] });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, toBuf(data)); return r.filePath;
});
ipcMain.handle('file:show', (e, p) => {
  if (!isAppSender(e) || typeof p !== 'string') return;
  const full = path.resolve(p);
  if (full.startsWith(path.join(app.getPath('videos'), 'Clipwerk')) || full.startsWith(app.getPath('documents'))) shell.showItemInFolder(full);
});
ipcMain.handle('file:openVideos', (e) => { if (isAppSender(e)) return shell.openPath(videosDir()); });
ipcMain.handle('app:version', () => app.getVersion());
