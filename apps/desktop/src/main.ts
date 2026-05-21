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
const SETTINGS_URL = new URL('/app/settings', APP_URL).toString();
const APP_BACKGROUND_COLOR = '#09090b';
const ENABLE_DEVTOOLS = APP_ENV !== 'production' || !app.isPackaged;
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';
const START_DESKTOP_AUTH_HANDOFF_CHANNEL = 'start-desktop-auth-handoff';
const OPEN_DESKTOP_AUTH_URL_CHANNEL = 'open-desktop-auth-url';
const CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL = 'close-desktop-auth-window';
const DESKTOP_AUTH_HANDOFF_PATH = '/desktop-auth';
const DESKTOP_RETURN_PARAM = 'desktop_return';
const AUTH_RETURN_PROTOCOL = 'jovie:';
const AUTH_RETURN_HOST = 'auth-return';

type UpdateChannel =
  | typeof UPDATE_AVAILABLE_CHANNEL
  | typeof UPDATE_DOWNLOADED_CHANNEL;

interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
}

let updateReadyToInstall = false;
let mainWindow: BrowserWindow | null = null;
let authHandoffWindow: BrowserWindow | null = null;
let pendingAuthReturnRoute: string | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function parseUrl(urlString: string): URL | null {
  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

function isAllowedInAppUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'https:') return false;
  return (
    parsed.origin === APP_ORIGIN && !isBrowserOnlyInAppPath(parsed.pathname)
  );
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

function isTrustedDesktopAuthSender(event: IpcMainInvokeEvent): boolean {
  const parsed = parseUrl(getIpcSenderUrl(event));
  return (
    parsed?.origin === APP_ORIGIN &&
    parsed.pathname === DESKTOP_AUTH_HANDOFF_PATH
  );
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const AUTH_ROUTE_PREFIXES = [
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/sso-callback',
] as const;

const BROWSER_ONLY_IN_APP_PREFIXES = ['/auth-return'] as const;

const BLOCKED_RETURN_PREFIXES = [
  ...AUTH_ROUTE_PREFIXES,
  '/auth-return',
  DESKTOP_AUTH_HANDOFF_PATH,
  '/__clerk',
  '/clerk',
  '/api',
] as const;

function isDesktopAuthPath(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some(prefix =>
    matchesPathPrefix(pathname, prefix)
  );
}

function isBrowserOnlyInAppPath(pathname: string): boolean {
  return BROWSER_ONLY_IN_APP_PREFIXES.some(prefix =>
    matchesPathPrefix(pathname, prefix)
  );
}

function sanitizeDesktopReturnRoute(
  route: string | null | undefined
): string | null {
  if (!route) return null;
  if (!route.startsWith('/') || route.startsWith('//')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(route);
  } catch {
    return null;
  }

  if (decoded.includes('\\') || decoded.startsWith('//')) return null;

  let parsed: URL;
  try {
    parsed = new URL(route, APP_URL);
  } catch {
    return null;
  }

  const normalized = `${parsed.pathname}${parsed.search}`;
  if (normalized === '/') return null;
  if (
    BLOCKED_RETURN_PREFIXES.some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    )
  ) {
    return null;
  }

  return normalized;
}

function getDefaultDesktopReturnRoute(pathname: string): string {
  return matchesPathPrefix(pathname, '/signup') ||
    matchesPathPrefix(pathname, '/sign-up')
    ? '/start'
    : '/app';
}

function buildDesktopBrowserAuthUrl(urlString: string): string | null {
  const parsed = parseUrl(urlString);
  if (
    !parsed ||
    parsed.origin !== APP_ORIGIN ||
    !isDesktopAuthPath(parsed.pathname)
  ) {
    return null;
  }

  const desktopReturn =
    sanitizeDesktopReturnRoute(parsed.searchParams.get(DESKTOP_RETURN_PARAM)) ??
    sanitizeDesktopReturnRoute(parsed.searchParams.get('redirect_url')) ??
    getDefaultDesktopReturnRoute(parsed.pathname);

  parsed.searchParams.delete('oauth_error');
  parsed.searchParams.set(DESKTOP_RETURN_PARAM, desktopReturn);
  return parsed.toString();
}

function buildDesktopAuthHandoffUrl(authUrl: string): string {
  const url = new URL(DESKTOP_AUTH_HANDOFF_PATH, APP_URL);
  url.searchParams.set('auth_url', authUrl);
  return url.toString();
}

function parseAuthReturnDeepLink(urlString: string): string | null {
  const parsed = parseUrl(urlString);
  if (
    !parsed ||
    parsed.protocol !== AUTH_RETURN_PROTOCOL ||
    parsed.hostname !== AUTH_RETURN_HOST
  ) {
    return null;
  }

  return sanitizeDesktopReturnRoute(parsed.searchParams.get('route'));
}

function findAuthReturnRouteInArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const route = parseAuthReturnDeepLink(arg);
    if (route) return route;
  }
  return null;
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

function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function loadReturnedRoute(route: string): void {
  const targetUrl = new URL(route, APP_URL).toString();
  const win =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : createWindow(targetUrl);

  if (win.webContents.getURL() !== targetUrl) {
    void win.loadURL(targetUrl);
  }

  showWindow(win);

  if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
    authHandoffWindow.close();
  }
}

function handleAuthReturnRoute(route: string): void {
  if (app.isReady()) {
    loadReturnedRoute(route);
    return;
  }

  pendingAuthReturnRoute = route;
}

function showDesktopAuthHandoff(authUrl: string): void {
  const handoffUrl = buildDesktopAuthHandoffUrl(authUrl);

  if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
    void authHandoffWindow.loadURL(handoffUrl);
    showWindow(authHandoffWindow);
    return;
  }

  authHandoffWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 360,
    minWidth: 360,
    minHeight: 320,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Jovie Sign In',
    backgroundColor: APP_BACKGROUND_COLOR,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    modal: false,
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

  authHandoffWindow.once('ready-to-show', () => {
    if (authHandoffWindow) showWindow(authHandoffWindow);
  });

  authHandoffWindow.on('closed', () => {
    authHandoffWindow = null;
  });

  authHandoffWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );
  authHandoffWindow.webContents.session.setPermissionCheckHandler(() => false);

  authHandoffWindow.webContents.on('will-navigate', event => {
    const parsed = parseUrl(event.url);
    if (
      parsed?.origin === APP_ORIGIN &&
      parsed.pathname === DESKTOP_AUTH_HANDOFF_PATH
    ) {
      return;
    }
    event.preventDefault();
    openExternalUrl(event.url);
  });

  authHandoffWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  void authHandoffWindow.loadURL(handoffUrl);
}

function maybeShowDesktopAuthHandoff(urlString: string): boolean {
  const authUrl = buildDesktopBrowserAuthUrl(urlString);
  if (!authUrl) return false;

  showDesktopAuthHandoff(authUrl);
  return true;
}

function createWindow(initialUrl = APP_URL): BrowserWindow {
  const windowState = loadWindowState();
  let lastNonAuthAppUrl = APP_URL;

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

  mainWindow = win;

  const initialAuthUrl = buildDesktopBrowserAuthUrl(initialUrl);
  if (initialAuthUrl) {
    showDesktopAuthHandoff(initialAuthUrl);
    void win.loadURL(APP_URL);
  } else {
    lastNonAuthAppUrl = initialUrl;
    void win.loadURL(initialUrl);
  }

  win.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );

  win.webContents.session.setPermissionCheckHandler(() => false);

  // Navigation guard: app-host routes stay in-window; auth routes get the
  // dedicated handoff; all other safe URLs open in the system browser.
  win.webContents.on('will-navigate', event => {
    if (maybeShowDesktopAuthHandoff(event.url)) {
      event.preventDefault();
      return;
    }

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
    if (maybeShowDesktopAuthHandoff(event.url)) {
      event.preventDefault();
      return;
    }

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
    if (maybeShowDesktopAuthHandoff(url)) {
      return { action: 'deny' };
    }

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

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
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
  win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (maybeShowDesktopAuthHandoff(url)) {
      void win.loadURL(lastNonAuthAppUrl);
      return;
    }
    const disposition = getUrlDisposition(url);
    if (disposition === 'external') {
      openExternalUrl(url);
      void win.loadURL(lastNonAuthAppUrl);
      return;
    }
    const parsed = parseUrl(url);
    if (parsed?.origin === APP_ORIGIN && !isBrowserOnlyInAppPath(parsed.pathname)) {
      lastNonAuthAppUrl = url;
    }
  });
  win.webContents.on('did-navigate', (_event, url) => {
    const parsed = parseUrl(url);
    if (parsed?.origin === APP_ORIGIN && !isDesktopAuthPath(parsed.pathname)) {
      lastNonAuthAppUrl = url;
    }
    sendNavState();
  });

  return win;
}

function openPreferences(): void {
  const win =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getFocusedWindow();
  if (!win) {
    createWindow(SETTINGS_URL);
    return;
  }

  void win.loadURL(SETTINGS_URL);
  showWindow(win);
}

function refreshApplicationMenu(): void {
  Menu.setApplicationMenu(buildApplicationMenu());
}

function checkForUpdatesFromMenu(): void {
  if (updateReadyToInstall) {
    autoUpdater.quitAndInstall();
    return;
  }

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Network unavailable or no update server configured yet — non-fatal
  });
}

function buildUpdateMenuItem(): MenuItemConstructorOptions {
  return {
    label: updateReadyToInstall
      ? 'Restart to install update…'
      : 'Check for updates…',
    click: checkForUpdatesFromMenu,
  };
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
          buildUpdateMenuItem(),
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
        buildUpdateMenuItem(),
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
  refreshApplicationMenu();
  sendToAppWindows(UPDATE_AVAILABLE_CHANNEL);
});

autoUpdater.on('update-downloaded', () => {
  updateReadyToInstall = true;
  refreshApplicationMenu();
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

ipcMain.handle(
  START_DESKTOP_AUTH_HANDOFF_CHANNEL,
  (event: IpcMainInvokeEvent, authUrl: unknown, ...args: unknown[]) => {
    if (
      !isTrustedIpcSender(event) ||
      args.length !== 0 ||
      typeof authUrl !== 'string'
    ) {
      return { ok: false, reason: 'invalid-request' };
    }

    const browserAuthUrl = buildDesktopBrowserAuthUrl(authUrl);
    if (!browserAuthUrl) {
      return { ok: false, reason: 'invalid-auth-url' };
    }

    showDesktopAuthHandoff(browserAuthUrl);
    return { ok: true };
  }
);

ipcMain.handle(
  OPEN_DESKTOP_AUTH_URL_CHANNEL,
  (event: IpcMainInvokeEvent, authUrl: unknown, ...args: unknown[]) => {
    if (
      !isTrustedDesktopAuthSender(event) ||
      args.length !== 0 ||
      typeof authUrl !== 'string'
    ) {
      return { ok: false, reason: 'invalid-request' };
    }

    const browserAuthUrl = buildDesktopBrowserAuthUrl(authUrl);
    if (!browserAuthUrl) {
      return { ok: false, reason: 'invalid-auth-url' };
    }

    openExternalUrl(browserAuthUrl);
    return { ok: true };
  }
);

ipcMain.handle(
  CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL,
  (event: IpcMainInvokeEvent) => {
    if (!isTrustedDesktopAuthSender(event)) {
      return { ok: false, reason: 'invalid-request' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }

    return { ok: true };
  }
);

function registerAuthReturnProtocol(): void {
  const defaultAppProcess = process as NodeJS.Process & {
    readonly defaultApp?: boolean;
  };

  if (defaultAppProcess.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('jovie', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }

  app.setAsDefaultProtocolClient('jovie');
}

if (gotSingleInstanceLock) {
  app.on('second-instance', (_event, argv) => {
    const route = findAuthReturnRouteInArgv(argv);
    if (route) {
      handleAuthReturnRoute(route);
      return;
    }

    const win =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
    showWindow(win);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    const route = parseAuthReturnDeepLink(url);
    if (route) {
      handleAuthReturnRoute(route);
    }
  });

  pendingAuthReturnRoute = findAuthReturnRouteInArgv(process.argv);
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

  registerAuthReturnProtocol();
  refreshApplicationMenu();
  createWindow(
    pendingAuthReturnRoute
      ? new URL(pendingAuthReturnRoute, APP_URL).toString()
      : APP_URL
  );
  pendingAuthReturnRoute = null;

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
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    } else {
      showWindow(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
