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
  type WebContents,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { APP_ENV, APP_URL } from './env';

// Separate userData for staging so staging and production apps coexist
if (APP_ENV === 'staging') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Staging'));
}

const APP_ORIGIN = new URL(APP_URL).origin;
const APP_ENTRY_URL = buildAppUrl('/app/chat');
const SETTINGS_URL = buildAppUrl('/app/settings');
const APP_BACKGROUND_COLOR = '#08090a';
const NAVIGATION_ABORTED_ERROR_CODE = -3;
const APP_ICON_FILENAME =
  APP_ENV === 'staging' ? 'icon-staging.png' : 'icon.png';
const APP_ICON_PATH = path.join(__dirname, '..', 'assets', APP_ICON_FILENAME);
const DESKTOP_USER_AGENT_PRODUCT = `JovieDesktop/${app.getVersion()}`;
const JOVIE_MARK_SVG_PATH =
  'm176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z';
const ENABLE_DEVTOOLS = APP_ENV !== 'production' || !app.isPackaged;
const MACOS_TRAFFIC_LIGHT_POSITION = { x: 20, y: 17 } as const;
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';
const DICTATION_STATUS_CHANNEL = 'dictation-status';

type UpdateChannel =
  | typeof UPDATE_AVAILABLE_CHANNEL
  | typeof UPDATE_DOWNLOADED_CHANNEL;

interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
}

interface DesktopDictationStatus {
  ok: boolean;
  nativeAvailable: boolean;
  webSpeechFallbackAllowed: boolean;
  mode: 'native' | 'web-speech' | 'unavailable';
  reason?: string;
}

let updateReadyToInstall = false;

app.setName(APP_ENV === 'staging' ? 'Jovie Staging' : 'Jovie');

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

function isTrustedPermissionOrigin(urlString?: string): boolean {
  const parsed = parseUrl(urlString ?? '');
  return parsed?.origin === APP_ORIGIN;
}

function isTrustedPermissionRequest(
  webContents: WebContents | null,
  requestingOrigin?: string
): boolean {
  if (requestingOrigin !== undefined) {
    return isTrustedPermissionOrigin(requestingOrigin);
  }
  return webContents !== null && isTrustedPermissionOrigin(webContents.getURL());
}

function isAudioOnlyMediaPermissionRequest(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  const mediaTypes = (details as { mediaTypes?: unknown }).mediaTypes;
  return (
    Array.isArray(mediaTypes) &&
    mediaTypes.includes('audio') &&
    !mediaTypes.includes('video')
  );
}

function isAudioMediaPermissionCheck(details: unknown): boolean {
  if (details === null || typeof details !== 'object') return false;
  return (details as { mediaType?: unknown }).mediaType === 'audio';
}

function getDesktopDictationStatus(): DesktopDictationStatus {
  return {
    ok: true,
    nativeAvailable: false,
    webSpeechFallbackAllowed: true,
    mode: 'web-speech',
    reason:
      process.platform === 'darwin'
        ? 'native-macos-dictation-is-system-owned-web-speech-fallback-enabled'
        : 'native-dictation-unavailable-web-speech-fallback-enabled',
  };
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

function buildDesktopLoadFailureUrl(): string {
  const retryUrl = JSON.stringify(APP_ENTRY_URL);
  const appOrigin = JSON.stringify(APP_ORIGIN);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jovie Desktop</title>
    <style>
      :root { color-scheme: dark; }
      html, body { margin: 0; min-height: 100%; background: #08090a; color: #f4f6fa; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif; }
      body { display: grid; place-items: center; overflow: hidden; }
      .shell { position: relative; display: grid; width: min(520px, calc(100vw - 48px)); gap: 22px; padding: 40px; border: 1px solid rgba(255,255,255,0.08); border-radius: 28px; background: linear-gradient(145deg, rgba(15,16,17,0.94), rgba(8,9,10,0.98)); box-shadow: 0 30px 120px rgba(0,0,0,0.42); }
      .mark { position: absolute; right: -52px; top: -46px; width: 220px; height: 220px; opacity: 0.055; }
      .brand { display: flex; align-items: center; gap: 14px; }
      .icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 14px; background: #f4f6fa; color: #080a0d; }
      h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0; }
      p { margin: 0; max-width: 38ch; color: #a8b0bd; font-size: 13px; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      button, a { display: inline-flex; height: 34px; align-items: center; justify-content: center; border-radius: 10px; padding: 0 13px; border: 1px solid rgba(255,255,255,0.1); background: #f4f6fa; color: #080a0d; font-size: 12px; font-weight: 590; text-decoration: none; }
      a { background: transparent; color: #d9dee7; }
      .meta { color: #737d8c; font-size: 11px; }
    </style>
  </head>
  <body>
    <main class="shell" role="main">
      <svg class="mark" viewBox="0 0 353.68 347.97" aria-hidden="true">
        <path fill="currentColor" d="${JOVIE_MARK_SVG_PATH}"/>
      </svg>
      <div class="brand">
        <div class="icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 353.68 347.97">
            <path fill="currentColor" d="${JOVIE_MARK_SVG_PATH}"/>
          </svg>
        </div>
        <div>
          <h1>Jovie Desktop</h1>
          <p>Built for artists.</p>
        </div>
      </div>
      <p>Jovie could not load the app shell. Check your connection, then retry. If this keeps happening, open Jovie in your browser and install the latest desktop build.</p>
      <div class="actions">
        <button type="button" onclick="window.location.href = ${retryUrl}">Retry</button>
        <a href=${appOrigin}>Open Jovie</a>
      </div>
      <div class="meta">Desktop shell runtime: Electron</div>
    </main>
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showDesktopLoadFailure(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  void win.loadURL(buildDesktopLoadFailureUrl());
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
      process.platform === 'darwin' ? MACOS_TRAFFIC_LIGHT_POSITION : undefined,
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

  win.webContents.setUserAgent(
    `${win.webContents.getUserAgent()} ${DESKTOP_USER_AGENT_PRODUCT}`
  );

  void win.loadURL(initialUrl);

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === NAVIGATION_ABORTED_ERROR_CODE) {
        return;
      }

      console.error('[Jovie Desktop] Shell load failure (graceful recovery)', {
        errorCode,
        errorDescription,
        validatedURL,
        appEntry: APP_ENTRY_URL,
      });
      showDesktopLoadFailure(win);
    }
  );

  win.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingOrigin =
        typeof details.requestingUrl === 'string'
          ? details.requestingUrl
          : undefined;
      callback(
        permission === 'media' &&
          isAudioOnlyMediaPermissionRequest(details) &&
          isTrustedPermissionRequest(webContents, requestingOrigin)
      );
    }
  );

  win.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      if (permission !== 'media') return false;
      if (!isAudioMediaPermissionCheck(details)) return false;
      return isTrustedPermissionRequest(webContents, requestingOrigin);
    }
  );

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

function checkForUpdates(): void {
  autoUpdater.checkForUpdates();
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
          {
            label: 'Check for Updates...',
            click: checkForUpdates,
          },
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

ipcMain.handle(
  DICTATION_STATUS_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedIpcSender(event) || args.length !== 0) {
      return {
        ok: false,
        nativeAvailable: false,
        webSpeechFallbackAllowed: false,
        mode: 'unavailable',
        reason: 'invalid-request',
      } satisfies DesktopDictationStatus;
    }

    return getDesktopDictationStatus();
  }
);

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
