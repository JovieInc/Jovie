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
  screen,
  type Session,
  shell,
} from 'electron';
import {
  isTrayAppState,
  MenuBarTray,
  type TrayAction,
  type TrayStatePayload,
} from './tray';
import { autoUpdater } from 'electron-updater';
import {
  bindPendingDesktopAuthCompletion,
  DESKTOP_AUTH_FLOW_PARAM,
  type PendingDesktopAuthPkce,
  parseAuthReturnDeepLink,
  reportDesktopAuthBindingFailure,
} from './desktop-auth-security';
import { installDesktopCspWatchdog } from './desktop-csp-watchdog';
import {
  shouldGrantTrustedAudioPermission,
  shouldGrantTrustedAudioPermissionCheck,
} from './desktop-permissions';
import { createDesktopSecurityReporter } from './desktop-security-reporting';
import { APP_ENV, APP_URL } from './env';
import {
  decideHudBuildReload,
  getHudBuildFingerprint,
  isHudRoutePath,
} from './hud-build-reload';
import {
  getUrlDisposition as getDesktopUrlDisposition,
  isAllowedExternalUrl as isAllowedDesktopExternalUrl,
  matchesPathPrefix,
  parseUrl,
  type UrlDisposition,
} from './navigation';
import { evaluateRemoteDebuggingGuard } from './remote-debugging-guard';
import {
  decideRendererRecovery,
  RENDERER_BOOT_WATCHDOG_MS,
  shouldArmRendererBootWatchdog,
} from './renderer-recovery';
import { SYSTEM_B_DESKTOP_TOKENS } from './system-b-tokens';
import { sanitizeWindowState, type WindowState } from './window-state';

// Separate userData for non-production shells so local, staging, and production
// sessions coexist without sharing cookies or corrupted renderer state.
if (APP_ENV === 'staging') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Staging'));
} else if (APP_ENV === 'local') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Local'));
}

const APP_ORIGIN = new URL(APP_URL).origin;
const URL_DISPOSITION_OPTIONS = { appUrl: APP_URL, appEnv: APP_ENV } as const;
const APP_ENTRY_URL = buildAppUrl('/app/chat');
const SETTINGS_URL = buildAppUrl('/app/settings');
const APP_BACKGROUND_COLOR = SYSTEM_B_DESKTOP_TOKENS.backgroundColor;
const NAVIGATION_ABORTED_ERROR_CODE = -3;
// A crashed/killed renderer is reloaded up to this many times before the shell
// gives up and shows the visible load-failure page (Retry) instead of leaving
// the window black. Reset to 0 only after a confirmed app-booted ping so a
// renderer that crashes deterministically after load still hits the cap.
const MAX_RENDERER_CRASH_RELOADS = 2;
const HUD_BUILD_INFO_POLL_INTERVAL_MS = 60 * 1000;
// electron-builder.local.yml and electron-builder.staging.yml both package the
// staging icon assets; only the production config ships icon.png.
const APP_ICON_FILENAME =
  APP_ENV === 'production' ? 'icon.png' : 'icon-staging.png';
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
const AUTH_RETURN_SCHEME =
  APP_ENV === 'staging'
    ? 'jovie-staging'
    : APP_ENV === 'local'
      ? 'jovie-local'
      : 'jovie';
const AUTH_RETURN_PROTOCOL = `${AUTH_RETURN_SCHEME}:`;
const AUTH_RETURN_HOST = 'auth';
const AUTH_RETURN_COMPLETE_PATH = '/complete';
const LEGACY_AUTH_RETURN_HOST = 'auth-return';
const DICTATION_STATUS_CHANNEL = 'dictation-status';
const TRAY_SET_STATE_CHANNEL = 'tray-set-state';
const TRAY_ACTION_CHANNEL = 'tray-action';
/** Renderer → main: first successful React paint of the hosted app (JOV-3595). */
const APP_BOOTED_CHANNEL = 'app-booted';
const DESKTOP_RUNTIME_LABEL_BY_PLATFORM: Partial<
  Record<NodeJS.Platform, string>
> = {
  darwin: 'Mac OS',
  linux: 'Linux',
  win32: 'Windows',
} as const;

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

interface RecentDesktopAuthCompletion {
  readonly completion: DesktopAuthCompletion;
  readonly expiresAt: number;
}

const AUTH_HANDOFF_WINDOW_BOUNDS = {
  width: 820,
  height: 520,
  minWidth: 680,
  minHeight: 460,
} as const;
const AUTH_COMPLETION_REPLAY_TTL_MS = 60_000;
const reportDesktopSecurityEvent = createDesktopSecurityReporter();

let updateReadyToInstall = false;
let mainWindow: BrowserWindow | null = null;
let authHandoffWindow: BrowserWindow | null = null;
let menuBarTray: MenuBarTray | null = null;
let pendingAuthCompletion: DesktopAuthCompletion | null = null;
let recentAuthCompletion: RecentDesktopAuthCompletion | null = null;
let pendingLegacyAuthReturnRoute: string | null = null;
let pendingDesktopAuthPkce: PendingDesktopAuthPkce | null = null;
let mainWindowHiddenForAuthHandoff = false;
let currentHudBuildFingerprint: string | null = null;

/**
 * Per-webContents boot-watchdog controllers (JOV-3595). The hosted web app
 * must call `notifyAppBooted` after first successful paint; otherwise the
 * shell shows the recovery page instead of a permanent black window.
 */
const rendererBootControllers = new Map<
  number,
  {
    readonly markBooted: () => void;
    readonly dispose: () => void;
  }
>();

function getDesktopAppDisplayName(): string {
  if (APP_ENV === 'staging') return 'Jovie Staging';
  if (APP_ENV === 'local') return 'Jovie Local';
  return 'Jovie';
}

app.setName(getDesktopAppDisplayName());

// Refuse to run a packaged shell that was launched with a Chrome DevTools
// Protocol switch. A packaged .app can be started by ANY local process, so an
// exposed CDP port lets any process running as the same user read the renderer's
// cookies (incl. the Clerk session) and inject JS — a full session hijack. Source
// runs may still opt in via JOVIE_DEV=1 (see scripts/launch-electron.mjs).
const remoteDebuggingGuard = evaluateRemoteDebuggingGuard({
  isPackaged: app.isPackaged,
  hasRemoteDebuggingPort: app.commandLine.hasSwitch('remote-debugging-port'),
  hasRemoteDebuggingPipe: app.commandLine.hasSwitch('remote-debugging-pipe'),
  jovieDev: process.env.JOVIE_DEV,
});

if (remoteDebuggingGuard.blocked) {
  reportDesktopSecurityEvent(
    'remote-debugging-blocked',
    remoteDebuggingGuard.reason ?? undefined
  );
  // Exit immediately to tear down the exposed CDP listener before any window
  // (and its authenticated session) is created.
  app.exit(1);
}

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

function resolveNavigationUrl(urlString: string): string {
  if (urlString.startsWith('/') && !urlString.startsWith('//')) {
    return new URL(urlString, APP_URL).toString();
  }

  return urlString;
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
    (parsed.pathname === DESKTOP_AUTH_HANDOFF_PATH ||
      parsed.pathname === '/signin' ||
      parsed.pathname === '/signup' ||
      parsed.pathname === '/sign-in' ||
      parsed.pathname === '/sign-up')
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
    flowNonce: base64Url(randomBytes(24)),
    createdAt: Date.now(),
  };
}

function rememberDesktopAuthPkce(pkce: PendingDesktopAuthPkce): void {
  pendingDesktopAuthPkce = pkce;
  recentAuthCompletion = null;
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
  authUrl.searchParams.set(DESKTOP_AUTH_FLOW_PARAM, pkce.flowNonce);
  return `${authUrl.pathname}${authUrl.search}`;
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
    return `${parsed.pathname}${parsed.search}`;
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

function parseDesktopAuthReturnDeepLink(urlString: string) {
  return parseAuthReturnDeepLink(
    urlString,
    parseUrl,
    AUTH_RETURN_PROTOCOL,
    AUTH_RETURN_HOST,
    AUTH_RETURN_COMPLETE_PATH
  );
}

function isAuthReturnDeepLinkCandidate(urlString: string): boolean {
  const parsed = parseUrl(urlString);
  return (
    parsed?.protocol === AUTH_RETURN_PROTOCOL &&
    parsed.hostname === AUTH_RETURN_HOST &&
    parsed.pathname === AUTH_RETURN_COMPLETE_PATH
  );
}

function findAuthReturnInArgv(argv: readonly string[]) {
  for (const arg of argv) {
    const completion = parseDesktopAuthReturnDeepLink(arg);
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

const WINDOW_STATE_FILE = path.join(
  app.getPath('userData'),
  'window-state.json'
);

function getAppIconPath(): string | undefined {
  return fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined;
}

function loadWindowState(): WindowState {
  const displayBounds = screen.getPrimaryDisplay().workArea;
  const connectedDisplays = screen
    .getAllDisplays()
    .map(display => display.workArea);

  try {
    const raw = fs.readFileSync(WINDOW_STATE_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return sanitizeWindowState(
      parsed,
      displayBounds,
      reportDesktopSecurityEvent,
      connectedDisplays
    );
  } catch {
    return sanitizeWindowState(undefined, displayBounds);
  }
}

function saveWindowState(win: BrowserWindow): void {
  // A minimized window reports garbage bounds (x: -32000 on Windows); keep the
  // last good state instead. getNormalBounds() returns the pre-maximize /
  // pre-fullscreen bounds so those transient states are never persisted.
  if (win.isMinimized()) return;
  const bounds = win.getNormalBounds();
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

// The main window grants trusted audio (mic/dictation) permissions on the
// shared default session. The auth handoff window overrides those handlers
// with deny-all for its lifetime, so they must be re-registered when the
// handoff closes — otherwise mic/dictation stays denied until app restart.
function registerMainWindowPermissionHandlers(session: Session): void {
  session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingOrigin =
        typeof details.requestingUrl === 'string'
          ? details.requestingUrl
          : undefined;
      callback(
        shouldGrantTrustedAudioPermission({
          permission,
          details,
          webContents,
          requestingOrigin,
          parseUrl,
          appOrigin: APP_ORIGIN,
        })
      );
    }
  );

  session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      shouldGrantTrustedAudioPermissionCheck({
        permission,
        details,
        webContents,
        requestingOrigin,
        parseUrl,
        appOrigin: APP_ORIGIN,
      })
  );
}

function buildAuthCompletionUrl(completion: DesktopAuthCompletion): string {
  const targetUrl = new URL(DESKTOP_AUTH_NATIVE_COMPLETE_PATH, APP_URL);
  targetUrl.searchParams.set('client', 'electron');
  targetUrl.searchParams.set('state', completion.state);
  return targetUrl.toString();
}

function loadAuthCompletion(completion: DesktopAuthCompletion): void {
  pendingAuthCompletion = completion;
  recentAuthCompletion = null;

  const targetUrl = buildAuthCompletionUrl(completion);
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

// A jovie://auth/complete deep link can reach a process with no in-flight
// PKCE flow to bind to (e.g. macOS open-url cold launch). Dropping it silently
// strands the user — signed in on the web, nothing visible in the app. Surface
// a fresh sign-in handoff so they can retry. PKCE state is intentionally NOT
// persisted across launches; the new flow starts over.
function surfaceNoPendingAuthFlow(): void {
  if (!app.isReady()) return;
  const win =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  showWindow(win);
  showDesktopAuthHandoff(buildCentralDesktopAuthUrl('sign_in', '/app'));
}

function handleAuthCompletion(
  completion: NonNullable<ReturnType<typeof parseDesktopAuthReturnDeepLink>>
): void {
  const binding = bindPendingDesktopAuthCompletion(
    pendingDesktopAuthPkce,
    completion
  );

  if (!binding.ok) {
    reportDesktopAuthBindingFailure(reportDesktopSecurityEvent, binding);
    if (binding.reason === 'pkce-expired') {
      // The pending flow is dead either way — drop it.
      pendingDesktopAuthPkce = null;
    } else if (binding.reason === 'no-pending-flow') {
      surfaceNoPendingAuthFlow();
    }
    // 'flow-mismatch' (a forged-but-well-formed deep link) must NOT clear the
    // legitimate in-flight login — leave pendingDesktopAuthPkce untouched.
    return;
  }

  pendingDesktopAuthPkce = null;

  const nativeCompletion: DesktopAuthCompletion = {
    code: completion.code,
    state: completion.state,
    codeVerifier: binding.codeVerifier,
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

function getDesktopAuthCompleteSenderState(
  event: IpcMainInvokeEvent
): string | null {
  const parsed = parseUrl(getIpcSenderUrl(event));
  return parsed?.searchParams.get('state') ?? null;
}

function getRecentAuthCompletionForState(
  state: string | null
): DesktopAuthCompletion | null {
  if (!recentAuthCompletion) return null;
  if (Date.now() > recentAuthCompletion.expiresAt) {
    recentAuthCompletion = null;
    return null;
  }

  if (state !== recentAuthCompletion.completion.state) return null;
  return recentAuthCompletion.completion;
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
      backgroundThrottling: false,
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

  authHandoffWindow.webContents.setUserAgent(
    `${authHandoffWindow.webContents.getUserAgent()} ${DESKTOP_USER_AGENT_PRODUCT}`
  );

  authHandoffWindow.once('ready-to-show', () => {
    hideMainWindowForAuthHandoff();
    if (authHandoffWindow) showWindow(authHandoffWindow);
  });

  authHandoffWindow.on('closed', () => {
    authHandoffWindow = null;
    restoreMainWindowAfterAuthHandoff();
    // The handoff installed deny-all permission handlers on the shared default
    // session; restore the main window's trusted-audio policy.
    if (mainWindow && !mainWindow.isDestroyed()) {
      registerMainWindowPermissionHandlers(mainWindow.webContents.session);
    }
  });

  authHandoffWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );
  authHandoffWindow.webContents.session.setPermissionCheckHandler(() => false);

  authHandoffWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = parseUrl(url);
    if (
      parsed?.origin === APP_ORIGIN &&
      parsed.pathname === DESKTOP_AUTH_HANDOFF_PATH
    ) {
      return;
    }
    event.preventDefault();
    void openExternalUrl(url);
  });

  authHandoffWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });

  void authHandoffWindow.loadURL(handoffUrl);
  showWindow(authHandoffWindow);
}

function maybeShowDesktopAuthHandoff(urlString: string): boolean {
  const authUrl = buildDesktopBrowserAuthUrl(urlString);
  if (!authUrl) return false;

  showDesktopAuthHandoff(authUrl);
  return true;
}

function shouldLoadDesktopAuthRouteInApp(urlString: string): boolean {
  const parsed = parseUrl(urlString);
  if (
    !parsed ||
    parsed.origin !== APP_ORIGIN ||
    !isDesktopAuthPath(parsed.pathname)
  ) {
    return false;
  }

  return true;
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function getDesktopRuntimeLabel(
  platform: NodeJS.Platform = process.platform
): string {
  return DESKTOP_RUNTIME_LABEL_BY_PLATFORM[platform] ?? platform;
}

function buildDesktopLoadFailureUrl(): string {
  const retryUrl = escapeHtmlAttribute(APP_ENTRY_URL);
  const appOrigin = escapeHtmlAttribute(APP_ORIGIN);
  const runtimeLabel = escapeHtmlAttribute(getDesktopRuntimeLabel());
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jovie Desktop</title>
    <style>
      :root { color-scheme: dark; --system-b-bg-base: ${SYSTEM_B_DESKTOP_TOKENS.backgroundColor}; --system-b-surface-1: ${SYSTEM_B_DESKTOP_TOKENS.surfaceColor}; --system-b-text-primary: ${SYSTEM_B_DESKTOP_TOKENS.textPrimary}; --system-b-text-secondary: ${SYSTEM_B_DESKTOP_TOKENS.textSecondary}; --system-b-border-subtle: ${SYSTEM_B_DESKTOP_TOKENS.borderSubtle}; --system-b-primary-bg: ${SYSTEM_B_DESKTOP_TOKENS.primaryBackground}; --system-b-primary-fg: ${SYSTEM_B_DESKTOP_TOKENS.primaryForeground}; --system-b-radius-shell: ${SYSTEM_B_DESKTOP_TOKENS.radiusShell}; --system-b-radius-pill: ${SYSTEM_B_DESKTOP_TOKENS.radiusPill}; --system-b-shadow-popover: ${SYSTEM_B_DESKTOP_TOKENS.shadowPopover}; }
      html, body { margin: 0; min-height: 100vh; background: var(--system-b-bg-base); color: var(--system-b-text-primary); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif; }
      body { display: grid; place-items: center; overflow: hidden; }
      .shell { position: relative; display: grid; width: min(520px, calc(100vw - 48px)); gap: 22px; padding: 40px; border: 1px solid var(--system-b-border-subtle); border-radius: var(--system-b-radius-shell); background: var(--system-b-surface-1); box-shadow: var(--system-b-shadow-popover); }
      .mark { position: absolute; right: -52px; top: -46px; width: 220px; height: 220px; opacity: 0.055; }
      .brand { display: flex; align-items: center; gap: 14px; }
      .icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: var(--system-b-radius-shell); background: var(--system-b-primary-bg); color: var(--system-b-primary-fg); }
      h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0; }
      p { margin: 0; max-width: 38ch; color: var(--system-b-text-secondary); font-size: 13px; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; }
      a { display: inline-flex; height: 34px; align-items: center; justify-content: center; border-radius: var(--system-b-radius-pill); padding: 0 13px; border: 1px solid var(--system-b-border-subtle); background: transparent; color: var(--system-b-text-primary); font-size: 12px; font-weight: 590; text-decoration: none; }
      .primary { background: var(--system-b-primary-bg); color: var(--system-b-primary-fg); }
      .meta { color: var(--system-b-text-secondary); font-size: 11px; }
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
      <div class="meta">Desktop shell runtime: ${runtimeLabel}</div>
    </main>
  </body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showDesktopLoadFailure(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  void win.loadURL(buildDesktopLoadFailureUrl());
}

function isHudWindow(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  const parsed = parseUrl(win.webContents.getURL());
  return parsed?.origin === APP_ORIGIN && isHudRoutePath(parsed.pathname);
}

async function fetchHudBuildFingerprint(): Promise<string | null> {
  const buildInfoUrl = new URL('/api/health/build-info', APP_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(buildInfoUrl, {
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const buildInfo: unknown = await response.json();
    return getHudBuildFingerprint(buildInfo);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function reloadAppWindowsForHudBuildChange(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (isHudWindow(win)) {
      win.webContents.reload();
    }
  }
}

async function checkHudBuildAndReload(): Promise<void> {
  if (!BrowserWindow.getAllWindows().some(isHudWindow)) {
    return;
  }

  const nextFingerprint = await fetchHudBuildFingerprint();
  const decision = decideHudBuildReload({
    currentFingerprint: currentHudBuildFingerprint,
    nextFingerprint,
  });
  currentHudBuildFingerprint = decision.nextFingerprint;

  if (decision.shouldReload) {
    reloadAppWindowsForHudBuildChange();
  }
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
      backgroundThrottling: false,
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

  installDesktopCspWatchdog({
    session: win.webContents.session,
    appOrigin: APP_ORIGIN,
    report: reportDesktopSecurityEvent,
  });

  // Visibility safety net (JOV-3835): if `ready-to-show` never fires — e.g. a
  // signed-out initial navigation redirects to /signin, the in-window nav is
  // aborted to about:blank, and the separate auth-handoff window fails to
  // appear — the app would launch to an invisible/black window with no way to
  // sign in. If nothing has become visible shortly after launch, force a
  // usable sign-in surface into THIS (main) window, which we know can render.
  const initialVisibilityFallback = setTimeout(() => {
    if (win.isDestroyed() || isAuthHandoffOpen() || win.isVisible()) return;
    const current = win.webContents.getURL();
    if (!current || current === 'about:blank') {
      const authUrl = buildCentralDesktopAuthUrl('sign_in', '/app');
      void win.loadURL(buildDesktopAuthHandoffUrl(authUrl));
    }
    showWindowNow(win);
  }, 6000);

  win.once('ready-to-show', () => {
    clearTimeout(initialVisibilityFallback);
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

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Jovie Desktop] Preload failed', {
      preloadPath,
      reason: error instanceof Error ? error.message : String(error),
    });
  });

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }

      if (errorCode === NAVIGATION_ABORTED_ERROR_CODE) {
        if (APP_ENV !== 'production') {
          console.warn('[Jovie Desktop] Main-frame load aborted', {
            validatedURL:
              typeof validatedURL === 'string'
                ? validatedURL.split('?')[0]
                : validatedURL,
          });
        }

        if (
          typeof validatedURL === 'string' &&
          maybeShowDesktopAuthHandoff(resolveNavigationUrl(validatedURL))
        ) {
          return;
        }

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

  // Renderer crash recovery. Electron leaves a crashed/killed renderer as a
  // blank black window with no recovery, which strands the user. Reload the
  // view on a crash, capped to avoid a crash loop, then fall back to the
  // visible load-failure page (Retry) instead of black.
  //
  // JOV-3595 also covers the "HTTP 200 but never interactive" path: after a
  // real hosted load finishes, the web app must ping APP_BOOTED_CHANNEL within
  // RENDERER_BOOT_WATCHDOG_MS. If it never does (React crash / hung hydrate),
  // show the recovery shell instead of a permanent black canvas.
  let rendererCrashReloadCount = 0;
  let rendererBooted = false;
  let bootWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  const webContentsId = win.webContents.id;

  const clearBootWatchdog = (): void => {
    if (bootWatchdogTimer !== null) {
      clearTimeout(bootWatchdogTimer);
      bootWatchdogTimer = null;
    }
  };

  const markRendererBooted = (): void => {
    rendererBooted = true;
    // Only a confirmed app-booted ping proves the renderer is healthy, so only
    // now does the crash-reload budget reset. Resetting on did-finish-load let
    // a renderer that crashes deterministically AFTER load (e.g. OOM during
    // hydration) loop reloads forever without ever reaching the failure page.
    rendererCrashReloadCount = 0;
    clearBootWatchdog();
  };

  const armBootWatchdog = (): void => {
    clearBootWatchdog();
    rendererBooted = false;
    if (win.isDestroyed()) return;
    const url = win.webContents.getURL();
    if (!shouldArmRendererBootWatchdog(url, APP_ORIGIN)) return;

    bootWatchdogTimer = setTimeout(() => {
      bootWatchdogTimer = null;
      if (win.isDestroyed() || rendererBooted) return;
      // Main window may sit on a transitional URL while the dedicated auth
      // handoff window is the interactive surface — do not false-alarm.
      if (win === mainWindow && isAuthHandoffOpen()) return;

      console.error('[Jovie Desktop] Renderer boot watchdog expired', {
        url: url.split('?')[0],
        timeoutMs: RENDERER_BOOT_WATCHDOG_MS,
      });
      showDesktopLoadFailure(win);
    }, RENDERER_BOOT_WATCHDOG_MS);
  };

  rendererBootControllers.set(webContentsId, {
    markBooted: markRendererBooted,
    dispose: () => {
      clearBootWatchdog();
      rendererBootControllers.delete(webContentsId);
    },
  });

  win.on('closed', () => {
    rendererBootControllers.get(webContentsId)?.dispose();
  });

  win.webContents.on('did-start-loading', () => {
    clearBootWatchdog();
    rendererBooted = false;
  });

  win.webContents.on('did-finish-load', () => {
    armBootWatchdog();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    clearBootWatchdog();
    const action = decideRendererRecovery({
      reason: details.reason,
      reloadCount: rendererCrashReloadCount,
      maxReloads: MAX_RENDERER_CRASH_RELOADS,
    });
    console.error('[Jovie Desktop] Renderer process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      action,
    });
    if (win.isDestroyed() || action === 'ignore') return;
    if (action === 'reload') {
      rendererCrashReloadCount += 1;
      win.webContents.reload();
      return;
    }
    showDesktopLoadFailure(win);
  });
  win.webContents.on('unresponsive', () => {
    console.warn('[Jovie Desktop] Renderer unresponsive', {
      url: win.webContents.getURL().split('?')[0],
    });
    if (win.isDestroyed()) return;
    if (win === mainWindow && isAuthHandoffOpen()) return;
    clearBootWatchdog();
    showDesktopLoadFailure(win);
  });

  registerMainWindowPermissionHandlers(win.webContents.session);

  // Navigation guard: app-host routes stay in-window; auth routes get the
  // dedicated handoff; all other safe URLs open in the system browser.
  win.webContents.on('will-navigate', (event, url) => {
    const navigationUrl = resolveNavigationUrl(url);
    if (maybeShowDesktopAuthHandoff(navigationUrl)) {
      event.preventDefault();
      return;
    }

    if (shouldLoadDesktopAuthRouteInApp(navigationUrl)) {
      return;
    }

    const disposition = getUrlDisposition(navigationUrl);
    if (disposition === 'in-app') return;

    event.preventDefault();
    if (disposition === 'external') {
      void openExternalUrl(navigationUrl);
    }
  });

  win.webContents.on('will-frame-navigate', event => {
    if (event.isMainFrame || getUrlDisposition(event.url) === 'in-app') return;
    event.preventDefault();
  });

  win.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
    const navigationUrl = resolveNavigationUrl(url);
    if (maybeShowDesktopAuthHandoff(navigationUrl)) {
      event.preventDefault();
      return;
    }

    if (shouldLoadDesktopAuthRouteInApp(navigationUrl)) {
      return;
    }

    const disposition = getUrlDisposition(navigationUrl);
    if (disposition === 'in-app') return;

    event.preventDefault();
    if (isMainFrame && disposition === 'external') {
      void openExternalUrl(navigationUrl);
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

  const initialAuthUrl = buildDesktopBrowserAuthUrl(initialUrl);
  if (initialAuthUrl) {
    showDesktopAuthHandoff(initialAuthUrl);
    void win.loadURL(buildDesktopAuthHandoffUrl(initialAuthUrl));
  } else {
    void win.loadURL(initialUrl);
  }

  return win;
}

function openPreferences(): void {
  // Mid-handoff the focused window is the small, non-resizable auth window and
  // the main window is intentionally hidden — loading settings into either
  // would clobber the sign-in flow, so no-op until the handoff closes.
  if (isAuthHandoffOpen()) return;

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(SETTINGS_URL);
    return;
  }

  void mainWindow.loadURL(SETTINGS_URL);
  showWindow(mainWindow);
}

function refreshApplicationMenu(): void {
  Menu.setApplicationMenu(buildApplicationMenu());
}

function checkForUpdatesFromMenu(): void {
  if (!shouldScheduleDesktopAutoUpdate()) {
    return;
  }

  if (updateReadyToInstall) {
    autoUpdater.quitAndInstall();
    return;
  }

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Network unavailable or no update server configured yet — non-fatal
  });
}

function shouldScheduleDesktopAutoUpdate(): boolean {
  // Local dev shells never auto-update. Production publishes to the
  // electron-updater channel; staging ships as CI artifacts and its update
  // check is a no-op (publish: null). See apps/desktop/SIGNING.md.
  if (APP_ENV === 'local' || process.platform === 'linux') {
    return false;
  }

  return true;
}

function scheduleDesktopAutoUpdate(): void {
  if (!shouldScheduleDesktopAutoUpdate()) {
    return;
  }

  autoUpdater.allowDowngrade = false;
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Network unavailable or no update server configured yet — non-fatal
  });

  const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Same: non-fatal update check failure
    });
  }, UPDATE_INTERVAL_MS);
}

function scheduleHudBuildAutoReload(): void {
  void checkHudBuildAndReload();

  const interval = setInterval(() => {
    void checkHudBuildAndReload();
  }, HUD_BUILD_INFO_POLL_INTERVAL_MS);

  interval.unref?.();
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

function handleTrayAction(action: TrayAction): void {
  if (action === 'open-preferences') {
    openPreferences();
    return;
  }

  const win =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  showWindow(win);

  if (action === 'new-message') {
    win.webContents.send(TRAY_ACTION_CHANNEL, action);
  }
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

// Hosted app first-paint heartbeat (JOV-3595). Uses send (not invoke) so a
// missing main handler on a stale binary cannot reject the renderer promise.
ipcMain.on(APP_BOOTED_CHANNEL, event => {
  const parsed = parseUrl(event.senderFrame?.url ?? event.sender.getURL());
  if (parsed?.origin !== APP_ORIGIN) return;
  rendererBootControllers.get(event.sender.id)?.markBooted();
});

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

    return openExternalUrl(new URL(browserAuthUrl, APP_URL).toString());
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
      const replayCompletion = getRecentAuthCompletionForState(
        getDesktopAuthCompleteSenderState(event)
      );
      if (replayCompletion) {
        return { ok: true, completion: replayCompletion };
      }
      return { ok: false, reason: 'missing-auth-completion' };
    }

    const completion = pendingAuthCompletion;
    pendingAuthCompletion = null;
    recentAuthCompletion = {
      completion,
      expiresAt: Date.now() + AUTH_COMPLETION_REPLAY_TTL_MS,
    };
    return { ok: true, completion };
  }
);

function registerAuthReturnProtocol(): void {
  const defaultAppProcess = process as NodeJS.Process & {
    readonly defaultApp?: boolean;
  };

  if (
    defaultAppProcess.defaultApp &&
    process.argv.length >= 2 &&
    !app.isPackaged
  ) {
    app.setAsDefaultProtocolClient(AUTH_RETURN_SCHEME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }

  app.setAsDefaultProtocolClient(AUTH_RETURN_SCHEME);
}

if (gotSingleInstanceLock) {
  app.on('second-instance', (_event, argv) => {
    const completion = findAuthReturnInArgv(argv);
    if (completion) {
      handleAuthCompletion(completion);
      return;
    }

    const invalidAuthReturn = argv.some(
      arg =>
        isAuthReturnDeepLinkCandidate(arg) && !parseDesktopAuthReturnDeepLink(arg)
    );
    if (invalidAuthReturn) {
      reportDesktopSecurityEvent('auth-deep-link-invalid-params');
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
    const completion = parseDesktopAuthReturnDeepLink(url);
    if (completion) {
      handleAuthCompletion(completion);
      return;
    }

    if (isAuthReturnDeepLinkCandidate(url)) {
      reportDesktopSecurityEvent('auth-deep-link-invalid-params');
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

  // macOS menu bar extra (NSStatusItem via Electron Tray)
  if (process.platform === 'darwin') {
    menuBarTray = new MenuBarTray(handleTrayAction);
  }

  createWindow(
    pendingAuthCompletion
      ? buildAuthCompletionUrl(pendingAuthCompletion)
      : pendingLegacyAuthReturnRoute
        ? new URL(pendingLegacyAuthReturnRoute, APP_URL).toString()
      : APP_ENTRY_URL
  );
  pendingLegacyAuthReturnRoute = null;
  scheduleDesktopAutoUpdate();
  scheduleHudBuildAutoReload();

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

ipcMain.handle(
  TRAY_SET_STATE_CHANNEL,
  (event: IpcMainInvokeEvent, payload: unknown, ...rest: unknown[]) => {
    if (!isTrustedIpcSender(event) || rest.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }
    if (
      !menuBarTray ||
      payload === null ||
      typeof payload !== 'object' ||
      !isTrayAppState((payload as Record<string, unknown>).state)
    ) {
      return { ok: false, reason: 'invalid-payload' };
    }
    menuBarTray.setState(payload as TrayStatePayload);
    return { ok: true };
  }
);
