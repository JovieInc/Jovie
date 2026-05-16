import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { APP_ENV, APP_URL } from './env';

// Separate userData for staging so staging and production apps coexist
if (APP_ENV === 'staging') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Staging'));
}

const APP_ORIGIN = new URL(APP_URL).origin;
const APP_ENTRY_URL = buildAppUrl('/app');
const SETTINGS_URL = buildAppUrl('/app/settings');
const APP_BACKGROUND_COLOR = '#09090b';
const APP_ICON_FILENAME =
  APP_ENV === 'staging' ? 'icon-staging.png' : 'icon.png';
const APP_ICON_PATH = path.join(__dirname, '..', 'assets', APP_ICON_FILENAME);
const ENABLE_DEVTOOLS = APP_ENV !== 'production' || !app.isPackaged;
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';

type UpdateChannel =
  | typeof UPDATE_AVAILABLE_CHANNEL
  | typeof UPDATE_DOWNLOADED_CHANNEL;

interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
}

let updateReadyToInstall = false;

// Explicit allowlist of OAuth/Clerk hosts permitted to load inside the app.
// Using endsWith() rather than includes() prevents hostname spoofing via
// strings like "clerk.evil.com" or "evilclerk.com".
const ALLOWED_AUTH_HOSTS = new Set<string>([
  'accounts.google.com',
  'appleid.apple.com',
]);
const ALLOWED_HOST_SUFFIXES = ['.clerk.accounts.dev', '.clerk.com'];

function isAllowedAuthHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  if (ALLOWED_AUTH_HOSTS.has(normalizedHostname)) return true;
  return ALLOWED_HOST_SUFFIXES.some(suffix =>
    normalizedHostname.endsWith(suffix)
  );
}

function parseUrl(urlString: string): URL | null {
  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

function buildAppUrl(pathname: string): string {
  const url = new URL(pathname, APP_URL);
  url.searchParams.set('runtime', 'electron');
  return url.toString();
}

function isAllowedInAppUrl(parsed: URL): boolean {
  if (
    parsed.protocol !== 'https:' &&
    !(APP_ENV === 'local' && parsed.protocol === 'http:')
  ) {
    return false;
  }
  return parsed.origin === APP_ORIGIN || isAllowedAuthHost(parsed.hostname);
}

function isAllowedExternalUrl(parsed: URL): boolean {
  return parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
}

type UrlDisposition = 'in-app' | 'external' | 'blocked';

function getUrlDisposition(urlString: string): UrlDisposition {
  const parsed = parseUrl(urlString);
  if (!parsed) return 'blocked';
  if (isAllowedInAppUrl(parsed)) return 'in-app';
  if (isAllowedExternalUrl(parsed)) return 'external';
  return 'blocked';
}

function openExternalUrl(urlString: string): void {
  const parsed = parseUrl(urlString);
  if (!parsed || !isAllowedExternalUrl(parsed)) return;
  void shell.openExternal(parsed.toString());
}

function getIpcSenderUrl(event: IpcMainInvokeEvent): string {
  return event.senderFrame?.url ?? event.sender.getURL();
}

function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  const parsed = parseUrl(getIpcSenderUrl(event));
  return parsed?.origin === APP_ORIGIN;
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

function getAppIconPath(): string | undefined {
  return fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined;
}

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

function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function createWindow(initialUrl = APP_ENTRY_URL): BrowserWindow {
  const windowState = loadWindowState();

  const win = new BrowserWindow({
    show: false,
    backgroundColor: APP_BACKGROUND_COLOR,
    paintWhenInitiallyHidden: true,
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    icon: getAppIconPath(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition:
      process.platform === 'darwin' ? { x: 13, y: 11 } : undefined,
    webPreferences: {
      contextIsolation: true,
      devTools: ENABLE_DEVTOOLS,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  win.once('ready-to-show', () => {
    showWindow(win);
  });

  void win.loadURL(initialUrl);

  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );

  win.webContents.session.setPermissionCheckHandler(() => false);

  // Navigation guard — keep browsing inside the app host + Clerk auth flows
  win.webContents.on('will-navigate', event => {
    const disposition = getUrlDisposition(event.url);
    if (disposition === 'in-app') return;

    event.preventDefault();
    if (disposition === 'external') {
      openExternalUrl(event.url);
    }
  });

  win.webContents.on('will-frame-navigate', event => {
    if (event.isMainFrame || getUrlDisposition(event.url) === 'in-app') return;
    event.preventDefault();
  });

  win.webContents.on('will-redirect', event => {
    const disposition = getUrlDisposition(event.url);
    if (disposition === 'in-app') return;

    event.preventDefault();
    if (event.isMainFrame && disposition === 'external') {
      openExternalUrl(event.url);
    }
  });

  // Deny all child window creation. Auth redirects happen in-place via
  // navigation guards. Internal targets stay in the app, safe external links
  // open in the system browser, and unsafe protocols are silently dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const disposition = getUrlDisposition(url);
    if (disposition === 'in-app') {
      void win.loadURL(url);
    } else if (disposition === 'external') {
      openExternalUrl(url);
    }

    return { action: 'deny' };
  });

  win.on('close', () => {
    saveWindowState(win);
  });

  function sendNavState(): void {
    if (win.isDestroyed()) return;
    const state: NavState = {
      canGoBack: win.webContents.canGoBack(),
      canGoForward: win.webContents.canGoForward(),
    };
    win.webContents.send(NAV_STATE_CHANNEL, state);
  }

  win.webContents.on('did-navigate-in-page', sendNavState);
  win.webContents.on('did-navigate', sendNavState);

  return win;
}

function openPreferences(): void {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) {
    createWindow(SETTINGS_URL);
    return;
  }

  void win.loadURL(SETTINGS_URL);
  showWindow(win);
}

function buildViewMenu(): MenuItemConstructorOptions[] {
  const viewMenu: MenuItemConstructorOptions[] = [];

  if (ENABLE_DEVTOOLS) {
    viewMenu.push(
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' }
    );
  }

  viewMenu.push(
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  );

  return viewMenu;
}

function buildApplicationMenu(): Menu {
  const viewMenu = buildViewMenu();
  const template: MenuItemConstructorOptions[] = [
    { role: 'editMenu' },
    { label: 'View', submenu: viewMenu },
    { role: 'windowMenu' },
  ];

  if (process.platform === 'darwin') {
    template.unshift(
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Preferences...',
            accelerator: 'Command+,',
            click: openPreferences,
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', accelerator: 'Command+Q' },
        ],
      },
      {
        label: 'File',
        submenu: [{ role: 'close', accelerator: 'Command+W' }],
      }
    );
  } else {
    template.unshift({
      label: 'File',
      submenu: [
        {
          label: 'Preferences...',
          accelerator: 'Ctrl+,',
          click: openPreferences,
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  return Menu.buildFromTemplate(template);
}

function sendToAppWindows(channel: UpdateChannel): void {
  for (const win of BrowserWindow.getAllWindows()) {
    const parsed = parseUrl(win.webContents.getURL());
    if (parsed?.origin === APP_ORIGIN) {
      win.webContents.send(channel);
    }
  }
}

// Wire auto-updater events to renderer IPC so the web UI can show the update pill.
autoUpdater.on('update-available', () => {
  updateReadyToInstall = false;
  sendToAppWindows(UPDATE_AVAILABLE_CHANNEL);
});

autoUpdater.on('update-downloaded', () => {
  updateReadyToInstall = true;
  sendToAppWindows(UPDATE_DOWNLOADED_CHANNEL);
});

// Allow renderer to trigger quit-and-install without exposing node access.
ipcMain.handle(
  QUIT_AND_INSTALL_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedIpcSender(event) || args.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }

    if (!updateReadyToInstall) {
      return { ok: false, reason: 'update-not-downloaded' };
    }

    autoUpdater.quitAndInstall();
    return { ok: true };
  }
);

ipcMain.handle(GO_BACK_CHANNEL, (event: IpcMainInvokeEvent) => {
  if (!isTrustedIpcSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && win.webContents.canGoBack())
    win.webContents.goBack();
});

ipcMain.handle(GO_FORWARD_CHANNEL, (event: IpcMainInvokeEvent) => {
  if (!isTrustedIpcSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && win.webContents.canGoForward())
    win.webContents.goForward();
});

app.whenReady().then(() => {
  const appIconPath = getAppIconPath();
  if (process.platform === 'darwin' && appIconPath && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  Menu.setApplicationMenu(buildApplicationMenu());
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
