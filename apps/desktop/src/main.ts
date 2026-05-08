import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { APP_ENV, APP_URL } from './env';

// Separate userData for staging so staging and production apps coexist
if (APP_ENV === 'staging') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Staging'));
}

const APP_HOST = new URL(APP_URL).hostname;

// Explicit allowlist of OAuth/Clerk hosts permitted to load inside the app.
// Using endsWith() rather than includes() prevents hostname spoofing via
// strings like "clerk.evil.com" or "evilclerk.com".
const ALLOWED_AUTH_HOSTS = new Set<string>([
  'accounts.google.com',
  'appleid.apple.com',
]);
const ALLOWED_HOST_SUFFIXES = ['.clerk.accounts.dev', '.clerk.com'];

function isAllowedAuthHost(hostname: string): boolean {
  if (ALLOWED_AUTH_HOSTS.has(hostname)) return true;
  return ALLOWED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}

function isAllowedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname === APP_HOST || isAllowedAuthHost(parsed.hostname);
  } catch {
    return false;
  }
}

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const WINDOW_STATE_FILE = path.join(
  app.getPath('userData'),
  'window-state.json'
);

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'width' in parsed &&
      'height' in parsed &&
      typeof (parsed as Record<string, unknown>).width === 'number' &&
      typeof (parsed as Record<string, unknown>).height === 'number'
    ) {
      return parsed as WindowState;
    }
  } catch {
    // Missing or corrupt — use defaults
  }
  return { width: 1280, height: 800 };
}

function saveWindowState(win: BrowserWindow): void {
  const bounds = win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  try {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // Non-fatal — window state loss is acceptable
  }
}

function createWindow(): BrowserWindow {
  const windowState = loadWindowState();

  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  void win.loadURL(APP_URL);

  // Navigation guard — keep browsing inside the app host + Clerk auth flows
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Deny all child window creation. Auth redirects happen in-place via
  // will-navigate; there is no in-app flow that requires a child window.
  // Routing through shell.openExternal prevents unsecured child windows
  // that would inherit default webPreferences without contextIsolation.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', () => {
    saveWindowState(win);
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();

  // Auto-update: check on launch then every 30 minutes
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Network unavailable or no update server configured yet — non-fatal
  });

  const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Same: non-fatal update check failure
    });
  }, UPDATE_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
