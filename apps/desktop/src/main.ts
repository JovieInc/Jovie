import { createHash, randomBytes } from 'node:crypto';
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
import {
  getUrlDisposition as getDesktopUrlDisposition,
  isAllowedExternalUrl as isAllowedDesktopExternalUrl,
  matchesPathPrefix,
  parseUrl,
  type UrlDisposition,
} from './navigation';

// Separate userData for staging so staging and production apps coexist
if (APP_ENV === 'staging') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Staging'));
}

const APP_ORIGIN = new URL(APP_URL).origin;
const URL_DISPOSITION_OPTIONS = { appUrl: APP_URL, appEnv: APP_ENV } as const;
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
const MACOS_TRAFFIC_LIGHT_X = 20;
const MACOS_TRAFFIC_LIGHT_Y = 17;
const MACOS_TRAFFIC_LIGHT_POSITION = {
  x: MACOS_TRAFFIC_LIGHT_X,
  y: MACOS_TRAFFIC_LIGHT_Y,
} as const;
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';
const START_DESKTOP_AUTH_HANDOFF_CHANNEL = 'start-desktop-auth-handoff';
const OPEN_DESKTOP_AUTH_URL_CHANNEL = 'open-desktop-auth-url';
const CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL = 'close-desktop-auth-window';
const CONSUME_DESKTOP_AUTH_COMPLETION_CHANNEL =
  'consume-desktop-auth-completion';
const DESKTOP_AUTH_HANDOFF_PATH = '/desktop-auth';
const DESKTOP_AUTH_START_PATH = '/auth/start';
const DESKTOP_AUTH_NATIVE_COMPLETE_PATH = '/auth/native-complete';
const DESKTOP_RETURN_PARAM = 'desktop_return';
const AUTH_RETURN_PROTOCOL = 'jovie:';
const AUTH_RETURN_HOST = 'auth';
const AUTH_RETURN_COMPLETE_PATH = '/complete';
const LEGACY_AUTH_RETURN_HOST = 'auth-return';
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

interface DesktopAuthCompletion {
  readonly code: string;
  readonly state: string;
  readonly codeVerifier: string;
}

interface DesktopAuthOpenResult {
  readonly ok: boolean;
  readonly reason?: string;
}

interface PendingDesktopAuthPkce {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly createdAt: number;
}

const AUTH_HANDOFF_WINDOW_BOUNDS = {
  width: 420,
  height: 360,
  minWidth: 360,
  minHeight: 320,
} as const;

let updateReadyToInstall = false;
let mainWindow: BrowserWindow | null = null;
let authHandoffWindow: BrowserWindow | null = null;
let pendingAuthCompletion: DesktopAuthCompletion | null = null;
let pendingLegacyAuthReturnRoute: string | null = null;
let pendingDesktopAuthPkce: PendingDesktopAuthPkce | null = null;
let mainWindowHiddenForAuthHandoff = false;

app.setName(APP_ENV === 'staging' ? 'Jovie Staging' : 'Jovie');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function buildAppUrl(pathname: string): string {
  const url = new URL(pathname, APP_URL);
  url.searchParams.set('runtime', 'electron');
  return url.toString();
}

function isAllowedExternalUrl(parsed: URL): boolean {
  return isAllowedDesktopExternalUrl(parsed, URL_DISPOSITION_OPTIONS);
}

function getUrlDisposition(urlString: string): UrlDisposition {
  return getDesktopUrlDisposition(urlString, URL_DISPOSITION_OPTIONS);
}

async function openExternalUrl(urlString: string): Promise<DesktopAuthOpenResult> {
  const parsed = parseUrl(urlString);
  if (!parsed || !isAllowedExternalUrl(parsed)) {
    return { ok: false, reason: 'blocked-url' };
  }

  try {
    await shell.openExternal(parsed.toString());
    return { ok: true };
  } catch (error) {
    console.error('[Jovie Desktop] Could not open external URL', {
      reason: error instanceof Error ? error.message : String(error),
      url: parsed.toString().split('?')[0],
    });
    return { ok: false, reason: 'open-external-failed' };
  }
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

function isTrustedDesktopAuthCompleteSender(
  event: IpcMainInvokeEvent
): boolean {
  const parsed = parseUrl(getIpcSenderUrl(event));
  return (
    parsed?.origin === APP_ORIGIN &&
    parsed.pathname === DESKTOP_AUTH_NATIVE_COMPLETE_PATH
  );
}

const AUTH_ROUTE_PREFIXES = [
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/sso-callback',
  '/signin/sso-callback',
  '/signup/sso-callback',
  '/sign-in/sso-callback',
  '/sign-up/sso-callback',
  '/auth/callback',
  DESKTOP_AUTH_NATIVE_COMPLETE_PATH,
  '/app/auth/callback',
] as const;

const DESKTOP_BROWSER_AUTH_PATHS = [
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
] as const;

const BLOCKED_RETURN_PREFIXES = [
  '/auth',
  ...AUTH_ROUTE_PREFIXES,
  '/auth-return',
  DESKTOP_AUTH_HANDOFF_PATH,
  '/__clerk',
  '/clerk',
  '/api',
] as const;

function isDesktopAuthPath(pathname: string): boolean {
  return DESKTOP_BROWSER_AUTH_PATHS.some(prefix => pathname === prefix);
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

function base64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function createDesktopAuthPkce(): PendingDesktopAuthPkce {
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(
    createHash('sha256').update(codeVerifier).digest()
  );
  return {
    codeVerifier,
    codeChallenge,
    createdAt: Date.now(),
  };
}

function rememberDesktopAuthPkce(pkce: PendingDesktopAuthPkce): void {
  pendingDesktopAuthPkce = pkce;
}

function consumePendingDesktopAuthPkce(): PendingDesktopAuthPkce | null {
  const pending = pendingDesktopAuthPkce;
  pendingDesktopAuthPkce = null;
  return pending;
}

function buildCentralDesktopAuthUrl(
  intent: 'sign_in' | 'sign_up',
  returnTo: string
): string {
  const pkce = createDesktopAuthPkce();
  rememberDesktopAuthPkce(pkce);

  const authUrl = new URL(DESKTOP_AUTH_START_PATH, APP_URL);
  authUrl.searchParams.set('client', 'electron');
  authUrl.searchParams.set('intent', intent);
  authUrl.searchParams.set('return_to', returnTo);
  authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  return authUrl.toString();
}

function isCentralDesktopAuthStartUrl(parsed: URL): boolean {
  return (
    parsed.origin === APP_ORIGIN &&
    parsed.pathname === DESKTOP_AUTH_START_PATH &&
    parsed.searchParams.get('client') === 'electron' &&
    parsed.searchParams.get('code_challenge_method') === 'S256' &&
    Boolean(parsed.searchParams.get('code_challenge')) &&
    Boolean(sanitizeDesktopReturnRoute(parsed.searchParams.get('return_to')))
  );
}

function buildDesktopBrowserAuthUrl(urlString: string): string | null {
  const parsed = parseUrl(urlString);
  if (parsed && isCentralDesktopAuthStartUrl(parsed)) {
    return parsed.toString();
  }

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
  const intent =
    matchesPathPrefix(parsed.pathname, '/signup') ||
    matchesPathPrefix(parsed.pathname, '/sign-up')
      ? 'sign_up'
      : 'sign_in';
  return buildCentralDesktopAuthUrl(intent, desktopReturn);
}

function buildDesktopAuthHandoffUrl(authUrl: string): string {
  const url = new URL(DESKTOP_AUTH_HANDOFF_PATH, APP_URL);
  url.searchParams.set('auth_url', authUrl);
  return url.toString();
}

function parseAuthReturnDeepLink(
  urlString: string
): Omit<DesktopAuthCompletion, 'codeVerifier'> | null {
  const parsed = parseUrl(urlString);
  if (
    !parsed ||
    parsed.protocol !== AUTH_RETURN_PROTOCOL ||
    parsed.hostname !== AUTH_RETURN_HOST ||
    parsed.pathname !== AUTH_RETURN_COMPLETE_PATH
  ) {
    return null;
  }

  const code = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  if (!code || !state) return null;

  return { code, state };
}

function findAuthReturnInArgv(
  argv: readonly string[]
): Omit<DesktopAuthCompletion, 'codeVerifier'> | null {
  for (const arg of argv) {
    const completion = parseAuthReturnDeepLink(arg);
    if (completion) return completion;
  }
  return null;
}

function parseLegacyAuthReturnRouteDeepLink(urlString: string): string | null {
  const parsed = parseUrl(urlString);
  if (
    !parsed ||
    parsed.protocol !== AUTH_RETURN_PROTOCOL ||
    parsed.hostname !== LEGACY_AUTH_RETURN_HOST
  ) {
    return null;
  }

  return sanitizeDesktopReturnRoute(parsed.searchParams.get('route'));
}

function findLegacyAuthReturnRouteInArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const route = parseLegacyAuthReturnRouteDeepLink(arg);
    if (route) return route;
  }
  return null;
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
  return (
    webContents !== null && isTrustedPermissionOrigin(webContents.getURL())
  );
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

function showWindowNow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win === mainWindow && isAuthHandoffOpen()) {
    mainWindowHiddenForAuthHandoff = true;
    if (win.isVisible()) {
      win.hide();
    }
    if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
      showWindowNow(authHandoffWindow);
    }
    return;
  }

  showWindowNow(win);
}

function isAuthHandoffOpen(): boolean {
  return Boolean(authHandoffWindow && !authHandoffWindow.isDestroyed());
}

function hideMainWindowForAuthHandoff(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindowHiddenForAuthHandoff = true;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  }
}

function restoreMainWindowAfterAuthHandoff(): void {
  if (!mainWindowHiddenForAuthHandoff) return;
  mainWindowHiddenForAuthHandoff = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow(mainWindow);
  }
}

function loadAuthCompletion(completion: DesktopAuthCompletion): void {
  pendingAuthCompletion = completion;

  const targetUrl = new URL(DESKTOP_AUTH_NATIVE_COMPLETE_PATH, APP_URL);
  targetUrl.searchParams.set('client', 'electron');
  targetUrl.searchParams.set('state', completion.state);
  const win =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : createWindow(targetUrl.toString());

  if (win.webContents.getURL() !== targetUrl.toString()) {
    void win.loadURL(targetUrl.toString());
  }

  if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
    authHandoffWindow.close();
  }

  mainWindowHiddenForAuthHandoff = false;
  showWindow(win);
}

function handleAuthCompletion(
  completion: Omit<DesktopAuthCompletion, 'codeVerifier'>
): void {
  const pkce = consumePendingDesktopAuthPkce();
  if (!pkce) return;

  const nativeCompletion: DesktopAuthCompletion = {
    ...completion,
    codeVerifier: pkce.codeVerifier,
  };

  if (app.isReady()) {
    loadAuthCompletion(nativeCompletion);
    return;
  }

  pendingAuthCompletion = nativeCompletion;
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

  if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
    authHandoffWindow.close();
  }

  mainWindowHiddenForAuthHandoff = false;
  showWindow(win);
}

function handleLegacyAuthReturnRoute(route: string): void {
  if (app.isReady()) {
    loadReturnedRoute(route);
    return;
  }

  pendingLegacyAuthReturnRoute = route;
}

function showDesktopAuthHandoff(authUrl: string): void {
  const handoffUrl = buildDesktopAuthHandoffUrl(authUrl);
  hideMainWindowForAuthHandoff();

  if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
    void authHandoffWindow.loadURL(handoffUrl);
    showWindow(authHandoffWindow);
    return;
  }

  authHandoffWindow = new BrowserWindow({
    show: false,
    ...AUTH_HANDOFF_WINDOW_BOUNDS,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Jovie Sign In',
    backgroundColor: APP_BACKGROUND_COLOR,
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
    hideMainWindowForAuthHandoff();
    if (authHandoffWindow) showWindow(authHandoffWindow);
  });

  authHandoffWindow.on('closed', () => {
    authHandoffWindow = null;
    restoreMainWindowAfterAuthHandoff();
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
    void openExternalUrl(event.url);
  });

  authHandoffWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
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

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function buildDesktopLoadFailureUrl(): string {
  const retryUrl = escapeHtmlAttribute(APP_ENTRY_URL);
  const appOrigin = escapeHtmlAttribute(APP_ORIGIN);
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
      a { display: inline-flex; height: 34px; align-items: center; justify-content: center; border-radius: 10px; padding: 0 13px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #d9dee7; font-size: 12px; font-weight: 590; text-decoration: none; }
      .primary { background: #f4f6fa; color: #080a0d; }
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
        <a class="primary" href="${retryUrl}">Retry</a>
        <a href="${appOrigin}">Open Jovie</a>
      </div>
      <div class="meta">Desktop shell runtime: Mac OS</div>
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
    if (isAuthHandoffOpen()) {
      mainWindowHiddenForAuthHandoff = true;
      return;
    }
    showWindow(win);
  });

  mainWindow = win;

  win.webContents.setUserAgent(
    `${win.webContents.getUserAgent()} ${DESKTOP_USER_AGENT_PRODUCT}`
  );

  const initialAuthUrl = buildDesktopBrowserAuthUrl(initialUrl);
  if (initialAuthUrl) {
    showDesktopAuthHandoff(initialAuthUrl);
    void win.loadURL(APP_ENTRY_URL);
  } else {
    void win.loadURL(initialUrl);
  }

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === NAVIGATION_ABORTED_ERROR_CODE) {
        return;
      }

      console.error('[Jovie Desktop] Shell load failure (graceful recovery)', {
        errorCode,
        errorDescription,
        validatedURL:
          typeof validatedURL === 'string'
            ? validatedURL.split('?')[0]
            : validatedURL,
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
      void openExternalUrl(event.url);
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
      void openExternalUrl(event.url);
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
      void openExternalUrl(url);
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
  win.webContents.on('did-navigate', sendNavState);

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
  async (
    event: IpcMainInvokeEvent,
    authUrl: unknown,
    ...args: unknown[]
  ): Promise<DesktopAuthOpenResult> => {
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

    return openExternalUrl(browserAuthUrl);
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

ipcMain.handle(
  CONSUME_DESKTOP_AUTH_COMPLETION_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedDesktopAuthCompleteSender(event) || args.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }

    if (!pendingAuthCompletion) {
      return { ok: false, reason: 'missing-auth-completion' };
    }

    const completion = pendingAuthCompletion;
    pendingAuthCompletion = null;
    return { ok: true, completion };
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
    const completion = findAuthReturnInArgv(argv);
    if (completion) {
      handleAuthCompletion(completion);
      return;
    }

    const legacyRoute = findLegacyAuthReturnRouteInArgv(argv);
    if (legacyRoute) {
      handleLegacyAuthReturnRoute(legacyRoute);
      return;
    }

    const win =
      mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
    showWindow(win);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    const completion = parseAuthReturnDeepLink(url);
    if (completion) {
      handleAuthCompletion(completion);
      return;
    }

    const legacyRoute = parseLegacyAuthReturnRouteDeepLink(url);
    if (legacyRoute) {
      handleLegacyAuthReturnRoute(legacyRoute);
    }
  });

  pendingLegacyAuthReturnRoute = findLegacyAuthReturnRouteInArgv(process.argv);
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;

  const appIconPath = getAppIconPath();
  if (process.platform === 'darwin' && appIconPath && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  registerAuthReturnProtocol();
  refreshApplicationMenu();
  createWindow(
    pendingAuthCompletion
      ? new URL(DESKTOP_AUTH_NATIVE_COMPLETE_PATH, APP_URL).toString()
      : pendingLegacyAuthReturnRoute
        ? new URL(pendingLegacyAuthReturnRoute, APP_URL).toString()
      : APP_ENTRY_URL
  );
  pendingLegacyAuthReturnRoute = null;

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
    if (isAuthHandoffOpen() && authHandoffWindow) {
      showWindow(authHandoffWindow);
      return;
    }

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
