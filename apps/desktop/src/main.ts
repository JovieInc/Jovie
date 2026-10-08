import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  net,
  Notification,
  powerMonitor,
  type Session,
  screen,
  session,
  shell,
  type WebContents,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { openCurrentOvieInBrowser } from './ovie-browser-recovery';
import {
  OPERATOR_SPAWN_TIMEOUT_MS,
  runBoundedProcess,
} from './bounded-process';
import {
  DESKTOP_BUILD_IDENTITY_PRINT_FLAG,
  DESKTOP_BUILD_IDENTITY_RESOURCE_NAME,
  DESKTOP_BUILD_IDENTITY_SHELL_CSS,
  DESKTOP_BUILD_IDENTITY_UNAVAILABLE,
  formatDesktopBuildIdentityDisplay,
  renderDesktopBuildIdentitySection,
  resolveDesktopBuildIdentity,
  resolveDesktopBuildIdentityIpcRequest,
  toDesktopBuildIdentityJson,
} from './build-identity';
import { BAKED_DESKTOP_BUILD_IDENTITY } from './build-identity.generated';
import {
  clearDesktopBrowserAuthRouteState,
  type DesktopAuthIntent,
  emptyDesktopBrowserAuthRouteState,
  rememberDesktopBrowserAuthRoutePkce,
  resolveDesktopBrowserAuthRoute,
  setDesktopAuthRecoveryNavigationPending,
} from './desktop-auth-browser-route';
import {
  DESKTOP_AUTH_HANDBACK_PATH,
  redeemDesktopReturnCode,
} from './desktop-auth-handback';
import { startDesktopAuthLoopbackServer } from './desktop-auth-loopback';
import {
  applyDesktopPasskeyStateUpdate,
  type DesktopPasskeyState,
  describeWebAuthnAccounts,
  parseDesktopPasskeyState,
  resolveDesktopWebAuthnConfig,
} from './desktop-passkey';
import {
  bindPendingDesktopAuthCompletion,
  DESKTOP_AUTH_FLOW_PARAM,
  type PendingDesktopAuthPkce,
  parseAuthReturnDeepLink,
  reportDesktopAuthBindingFailure,
} from './desktop-auth-security';
import {
  buildDesktopUpdateMenuItem,
  buildManualUpdateCheckFeedback,
  DESKTOP_UPDATE_INITIAL_STATE,
  type DesktopUpdateEvent,
  type DesktopUpdatePhase,
  hasNightlyUpdateFlag,
  NIGHTLY_UPDATE_TIMEOUT_MS,
  reduceDesktopUpdateState,
  shouldInstallDownloadedUpdateNow,
  shouldInstallDownloadedUpdateWhileRunning,
  shouldRunWakeUpdateCheck,
  shouldScheduleDesktopAutoUpdate,
} from './desktop-auto-update';
import {
  createDesktopLaunchReadiness,
  createLaunchReadinessWriter,
  DESKTOP_COMPOSER_READINESS_CHANNEL,
  DESKTOP_LAUNCH_READINESS_FILE,
  type ReadinessSender,
} from './desktop-launch-readiness';
import { installDesktopCspWatchdog } from './desktop-csp-watchdog';
import {
  parseDesktopNotificationRequest,
  resolveDesktopNotificationClickAction,
} from './desktop-notifications';
import {
  shouldGrantTrustedAudioPermission,
  shouldGrantTrustedAudioPermissionCheck,
  shouldGrantTrustedHudScreenPermission,
  shouldGrantTrustedHudScreenPermissionCheck,
} from './desktop-permissions';
import { createDesktopSecurityReporter } from './desktop-security-reporting';
import { APP_ENV, APP_URL } from './env';
import {
  decideHudBuildReload,
  getHudBuildFingerprint,
  isHudRoutePath,
  isWebBuildReloadPath,
  SESSION_WORK_PROBE,
  shouldReloadWindowForWebBuild,
} from './hud-build-reload';
import { resolveIpcSenderUrl } from './ipc-sender';
import {
  probeAllWindowWorkSafety,
  probeSessionWorkSafety,
  singleFlight,
} from './session-work-state';
import {
  type MainLivenessMonitor,
  createMainLivenessMonitor,
  spawnMainLivenessWorker,
  summarizeUnhandledRejection,
} from './main-liveness';
import { installNightlyUpdateLaunchAgent } from './nightly-update-launch-agent';
import { DesktopNavigationCoordinator } from './navigation-coordinator';
import { createStartupMaintenanceGate } from './startup-maintenance';
import {
  getUrlDisposition as getDesktopUrlDisposition,
  isAllowedExternalUrl as isAllowedDesktopExternalUrl,
  isAllowedPublicProfileUrl,
  matchesPathPrefix,
  parseUrl,
  type UrlDisposition,
} from './navigation';
import {
  decideOperatorLaunch,
  parseOperatorLaunchRequest,
  terminalLaunchSpec,
} from './operator-launch';
import {
  packagedDesktopAppId,
  packagedUsesCompetingStagingShell,
} from './ovie-door';
import { evaluateRemoteDebuggingGuard } from './remote-debugging-guard';
import {
  classifyDesktopLoadFailure,
  createAuthHandoffNavigationRecovery,
  createLocalHostedLoadRetryController,
  type DesktopLoadFailureReason,
  type DesktopLoadFailureView,
  decideAbortedMainFrameRecovery,
  decideDidFinishLoadRecovery,
  decideHostedLoadRetry,
  decideRecoveryUnlatch,
  decideRendererBootWatchdogAfterLoad,
  decideRendererLoadStart,
  decideRendererRecovery,
  decideRendererWatchdogExpiry,
  describeDesktopLoadFailure,
  hostedUrlCandidates,
  isChromiumErrorDocument,
  parseDidStartNavigation,
  RECOVERY_UNLATCH_POLL_MS,
  rendererWatchdogMs,
  shouldArmRendererWatchdogsForAppEnv,
  shouldRecoverAuthHandoffToCanonicalShell,
  shouldSkipRendererWatchdogForAuthHandoff,
} from './renderer-recovery';
import {
  createSummerRuntimeBridge,
  type SummerRuntimeBridge,
} from './summer-runtime-bridge';
import { authHandoffWindowBounds } from './auth-handoff-window';
import { SYSTEM_B_DESKTOP_TOKENS } from './system-b-tokens';
import {
  isTrayAppState,
  MenuBarTray,
  type TrayAction,
  type TrayStatePayload,
} from './tray';
import {
  persistNativeFullscreen,
  shouldRestoreNativeFullscreen,
  type WindowState,
} from './window-state';
import {
  GET_VISUAL_ACTIVITY_CHANNEL,
  observeWindowVisualActivity,
  trustedVisualActivityRequest,
  VISUAL_ACTIVITY_CHANNEL,
} from './visual-activity';
import {
  createWindowStateStore,
  WINDOW_STATE_SHUTDOWN_FLUSH_MS,
} from './window-state-store';

// Separate userData for non-production shells so local, staging, and production
// sessions coexist without sharing cookies or corrupted renderer state.
if (APP_ENV === 'staging') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Staging'));
} else if (APP_ENV === 'local') {
  app.setPath('userData', path.join(app.getPath('appData'), 'Jovie-Local'));
}

const APP_ORIGIN = new URL(APP_URL).origin;
const authNavigationRecoveries = new Map<
  number,
  ReturnType<typeof createAuthHandoffNavigationRecovery>
>();
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
const MAX_HOSTED_LOAD_RETRIES = APP_ENV === 'local' ? 3 : 1;
const HOSTED_LOAD_RETRY_DELAY_MS = APP_ENV === 'local' ? 2_000 : 0;
const { bootMs: RENDERER_BOOT_WATCHDOG_MS, loadMs: RENDERER_LOAD_WATCHDOG_MS } =
  rendererWatchdogMs(APP_ENV);
const HUD_BUILD_INFO_POLL_INTERVAL_MS = 60 * 1000;
// electron-builder.local.yml and electron-builder.staging.yml both package the
// staging icon assets; only the production config ships icon.png.
const APP_ICON_FILENAME =
  APP_ENV === 'production' ? 'icon.png' : 'icon-staging.png';
const APP_ICON_PATH = path.join(__dirname, '..', 'assets', APP_ICON_FILENAME);
const APP_ICON_AVAILABLE = fs.existsSync(APP_ICON_PATH);
const DESKTOP_USER_AGENT_PRODUCT = `JovieDesktop/${app.getVersion()}`;
const JOVIE_MARK_SVG_PATH =
  'm176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z';
const ENABLE_DEVTOOLS = APP_ENV !== 'production' || !app.isPackaged;

function readPackagedBuildIdentityRecord(): unknown {
  if (!app.isPackaged) return null;
  try {
    // Exact-site bootstrap read for About/identity before whenReady.
    // Interactive window-state and launch-agent paths stay async.
    return JSON.parse(
      fs.readFileSync(
        path.join(process.resourcesPath, DESKTOP_BUILD_IDENTITY_RESOURCE_NAME),
        'utf8'
      )
    );
  } catch {
    return null;
  }
}

const desktopBuildIdentity = resolveDesktopBuildIdentity({
  baked: BAKED_DESKTOP_BUILD_IDENTITY,
  runtimeChannel: APP_ENV,
  runtimeVersion: app.getVersion(),
  packaged: app.isPackaged,
  packagedRecord: readPackagedBuildIdentityRecord(),
});
const printBuildIdentityOnStart = process.argv.includes(
  DESKTOP_BUILD_IDENTITY_PRINT_FLAG
);
const MACOS_TRAFFIC_LIGHT_X = 20;
const MACOS_TRAFFIC_LIGHT_Y = 17;
const MACOS_TRAFFIC_LIGHT_POSITION = {
  x: MACOS_TRAFFIC_LIGHT_X,
  y: MACOS_TRAFFIC_LIGHT_Y,
} as const;
const UPDATE_AVAILABLE_CHANNEL = 'update-available';
const UPDATE_DOWNLOADED_CHANNEL = 'update-downloaded';
const QUIT_AND_INSTALL_CHANNEL = 'quit-and-install';
const DESKTOP_UPDATE_STATE_CHANNEL = 'desktop-update-state';
const DESKTOP_UPDATE_GET_STATE_CHANNEL = 'desktop-update-get-state';
const DESKTOP_UPDATE_CHECK_CHANNEL = 'desktop-update-check';
const DESKTOP_UPDATE_DOWNLOAD_CHANNEL = 'desktop-update-download';
const DESKTOP_UPDATE_INSTALL_CHANNEL = 'desktop-update-install';
const DESKTOP_UPDATE_NOTES_URL = `${APP_ORIGIN}/changelog`;
const GO_BACK_CHANNEL = 'go-back';
const GO_FORWARD_CHANNEL = 'go-forward';
const NAV_STATE_CHANNEL = 'nav-state-changed';
const START_DESKTOP_AUTH_HANDOFF_CHANNEL = 'start-desktop-auth-handoff';
const OPEN_DESKTOP_AUTH_URL_CHANNEL = 'open-desktop-auth-url';
const OPEN_CURRENT_OVIE_IN_BROWSER_CHANNEL = 'open-current-ovie-in-browser';
const COPY_DESKTOP_AUTH_URL_CHANNEL = 'copy-desktop-auth-url';
const CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL = 'close-desktop-auth-window';
const REDEEM_DESKTOP_AUTH_RETURN_CODE_CHANNEL =
  'redeem-desktop-auth-return-code';
const GET_DESKTOP_PASSKEY_STATE_CHANNEL = 'get-desktop-passkey-state';
const SET_DESKTOP_PASSKEY_STATE_CHANNEL = 'set-desktop-passkey-state';
const COMPLETE_DESKTOP_PASSKEY_SIGN_IN_CHANNEL =
  'complete-desktop-passkey-sign-in';
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
const DESKTOP_NOTIFICATION_CHANNEL = 'desktop-notification-show';
/** Renderer → main: first successful React paint of the hosted app (JOV-3595). */
const APP_BOOTED_CHANNEL = 'app-booted';
const CLIENT_NAVIGATION_CHANNEL = 'desktop-client-navigation';
const CLIENT_NAVIGATION_READY_CHANNEL = 'desktop-client-navigation-ready';
const LAUNCH_OPERATOR_CONTROL_CHANNEL = 'launch-operator-control';
const GET_BUILD_IDENTITY_CHANNEL = 'get-build-identity';
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

const AUTH_COMPLETION_REPLAY_TTL_MS = 60_000;
const PUBLIC_PROFILE_PREVIEW_PARTITION = 'persist:jovie-public-profile-preview';
const PUBLIC_PROFILE_PREVIEW_BOUNDS = {
  width: 390,
  height: 844,
  minWidth: 320,
  minHeight: 568,
} as const;
const OPEN_PUBLIC_PROFILE_IN_BROWSER_CHANNEL = 'open-public-profile-in-browser';
const reportDesktopSecurityEvent = createDesktopSecurityReporter();

let updateReadyToInstall = false;
// Typed updater phase mirrored to the renderer via desktop-update-state IPC.
let desktopUpdatePhase: DesktopUpdatePhase = DESKTOP_UPDATE_INITIAL_STATE;
// Set only for a menu-initiated "Check for updates…" click so its result
// (up to date / error) shows a dialog; silent background checks stay silent.
let pendingManualUpdateCheck = false;
let mainWindow: BrowserWindow | null = null;
const desktopNavigation = new DesktopNavigationCoordinator();
const visualActivityReaders = new Map<number, () => boolean>();
let publicProfilePreviewWindow: BrowserWindow | null = null;
let authHandoffWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;
let menuBarTray: MenuBarTray | null = null;
let pendingAuthCompletion: DesktopAuthCompletion | null = null;
let recentAuthCompletion: RecentDesktopAuthCompletion | null = null;
let pendingLegacyAuthReturnRoute: string | null = null;
let desktopBrowserAuthRouteState = emptyDesktopBrowserAuthRouteState();
// A return code and a late deep link can deliver the same exchange code; the
// second must not surface a fresh "no pending flow" handoff after success.
let lastCompletedAuthCode: string | null = null;
// RFC 8252 section 7.3 loopback listener port, live for the app lifetime.
// A request only completes a flow while one is pending — the flow nonce and
// PKCE verifier still gate the handoff.
let authLoopbackPort: number | null = null;
// True once Touch ID WebAuthn is configured (signed build with profile).
let desktopPasskeyAvailable = false;
let mainWindowHiddenForAuthHandoff = false;
let currentHudBuildFingerprint: string | null = null;
// webContents ids still showing the web build that preceded the current one.
const webBuildReloadPending = new Set<number>();
const workDocumentGenerations = new WeakMap<WebContents, number>();
ipcMain.on('desktop-work-state-changed', event => {
  if (event.senderFrame !== event.sender.mainFrame) return;
  workDocumentGenerations.set(
    event.sender,
    (workDocumentGenerations.get(event.sender) ?? 0) + 1
  );
});
app.on('web-contents-created', (_event, contents) => {
  contents.on('did-start-navigation', (...args: unknown[]) => {
    const navigation = parseDidStartNavigation(args);
    if (navigation?.isMainFrame && !navigation.isInPlace) {
      workDocumentGenerations.set(
        contents,
        (workDocumentGenerations.get(contents) ?? 0) + 1
      );
    }
  });
});
let lastDesktopUpdateCheckMs: number | null = null;
let startupMaintenance: ReturnType<typeof createStartupMaintenanceGate> | null =
  null;
let summerRuntimeBridge: SummerRuntimeBridge | null = null;
let mainLivenessMonitor: MainLivenessMonitor | null = null;

// Observe async rejections in the main process instead of letting Node's
// default warning be the only trace. The summary is bounded and redacted;
// observing a rejection never marks the app healthy — the liveness probe
// below is the only responsiveness verdict.
process.on('unhandledRejection', reason => {
  console.error('[Jovie Desktop] Unhandled rejection', {
    reason: summarizeUnhandledRejection(reason),
  });
});

// JOV-6192: a blocked main process must be detected by a scheduler outside
// the blocked loop. The probe Worker owns the deadline on its own thread; a
// timer scheduled on the main loop could never fire to report the block.
function startMainLivenessMonitor(): void {
  if (mainLivenessMonitor) return;
  mainLivenessMonitor = createMainLivenessMonitor({
    spawnProbe: () => spawnMainLivenessWorker(),
    onVerdict: message => {
      if (message.verdict === 'blocked') {
        console.error('[Jovie Desktop] Main process unresponsive', {
          pongLagMs: message.pongLagMs,
        });
      } else {
        console.info('[Jovie Desktop] Main process responsive again', {
          pongLagMs: message.pongLagMs,
        });
      }
    },
    onProbeError: error => {
      console.error('[Jovie Desktop] Main liveness probe failed to start', {
        reason: summarizeUnhandledRejection(error),
      });
    },
  });
}

/**
 * Per-webContents boot-watchdog controllers (JOV-3595). The hosted web app
 * must call `notifyAppBooted` after first successful paint; otherwise the
 * shell shows the recovery page instead of a permanent black window.
 */
const rendererBootControllers = new Map<
  number,
  {
    readonly markBooted: () => void;
    readonly beginRecoveryUnlatch: () => void;
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

function applyLocalChromiumLoopbackResolver(): void {
  if (APP_ENV !== 'local') return;
  // Chromium resolves localhost to ::1 first. Next on macOS often binds
  // IPv4-only 127.0.0.1, so the hosted shell fails with ERR_CONNECTION_REFUSED
  // and JOV-3595 recovery replaces the app. Keep the localhost origin (auth
  // cookies stay) but force IPv4 resolution.
  app.commandLine.appendSwitch(
    'host-resolver-rules',
    'MAP localhost 127.0.0.1'
  );
}

applyLocalChromiumLoopbackResolver();

function applyMacGraphiteCompositorWorkaround(): void {
  if (process.platform !== 'darwin') return;
  // JOV-5289: Skia Graphite leaves stale compositor tiles after idle on
  // Electron 43 / Chromium 150, even with the out-of-order-recording fix.
  // Ganesh keeps the sandbox and feature set; must run before whenReady.
  app.commandLine.appendSwitch('disable-skia-graphite');
}

applyMacGraphiteCompositorWorkaround();

const nightlyUpdateLaunch =
  hasNightlyUpdateFlag(process.argv) ||
  app.commandLine.hasSwitch('jovie-nightly-update');
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock && !printBuildIdentityOnStart) {
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

function canonicalPublicProfileUrl(urlString: string): string | null {
  const parsed = parseUrl(resolveNavigationUrl(urlString));
  if (!parsed || !isAllowedPublicProfileUrl(parsed, URL_DISPOSITION_OPTIONS)) {
    return null;
  }

  // Never carry desktop-shell or auth handoff state into the isolated public
  // session. The canonical profile URL is otherwise unchanged.
  parsed.searchParams.delete('runtime');
  parsed.searchParams.delete(DESKTOP_RETURN_PARAM);
  parsed.searchParams.delete('auth_return');
  parsed.searchParams.delete('redirect_url');
  return parsed.toString();
}

async function openPublicProfileInBrowser(
  urlString: string
): Promise<DesktopAuthOpenResult> {
  const canonicalUrl = canonicalPublicProfileUrl(urlString);
  if (!canonicalUrl) return { ok: false, reason: 'blocked-url' };
  try {
    await shell.openExternal(canonicalUrl);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'open-external-failed' };
  }
}

async function openExternalUrl(
  urlString: string
): Promise<DesktopAuthOpenResult> {
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

function getIpcSenderUrl(event: IpcMainEvent | IpcMainInvokeEvent): string {
  const senderFrame = event.senderFrame;
  return resolveIpcSenderUrl(
    senderFrame == null
      ? null
      : {
          url: senderFrame.url,
          detached: senderFrame.detached,
          // parent is null only for the webContents' root frame.
          isMainFrame: senderFrame.parent === null,
        },
    event.sender.getURL()
  );
}

function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  const parsed = parseUrl(getIpcSenderUrl(event));
  return parsed?.origin === APP_ORIGIN;
}

function isTrustedPublicProfilePreviewSender(
  event: IpcMainInvokeEvent
): boolean {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  return (
    senderWindow === publicProfilePreviewWindow &&
    Boolean(canonicalPublicProfileUrl(getIpcSenderUrl(event)))
  );
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
  '/auth/native-return',
  '/auth/ios/complete',
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
  desktopBrowserAuthRouteState = rememberDesktopBrowserAuthRoutePkce(
    desktopBrowserAuthRouteState,
    pkce
  );
  recentAuthCompletion = null;
}

function clearPendingDesktopAuthFlow(): void {
  desktopBrowserAuthRouteState = clearDesktopBrowserAuthRouteState();
}

// A fresh install, a second copy of Jovie, or an app launched from a
// translocated path can leave jovie:// pointing somewhere else. Reclaim it
// before each browser handoff. The return code covers the case where macOS
// still routes the link elsewhere.
function ensureAuthReturnProtocolRegistered(): void {
  if (isAuthReturnProtocolRegistered()) return;
  registerAuthReturnProtocol();
  reportDesktopSecurityEvent(
    'auth-protocol-handler-repaired',
    isAuthReturnProtocolRegistered() ? 'repaired' : 'still-unregistered'
  );
}

function createCentralDesktopAuthRoute(
  intent: DesktopAuthIntent,
  returnTo: string
): { readonly authUrl: string; readonly pendingPkce: PendingDesktopAuthPkce } {
  const pkce = createDesktopAuthPkce();

  const authUrl = new URL(DESKTOP_AUTH_START_PATH, APP_URL);
  authUrl.searchParams.set('client', 'electron');
  authUrl.searchParams.set('intent', intent);
  authUrl.searchParams.set('return_to', returnTo);
  authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set(DESKTOP_AUTH_FLOW_PARAM, pkce.flowNonce);
  // This build can redeem a typed return code (desktop-auth-handback.ts).
  authUrl.searchParams.set('desktop_return_code', '1');
  // And it runs a pending-flow loopback listener (desktop-auth-loopback.ts):
  // /auth/native-return hands the completion straight to it when jovie://
  // cannot reach the app.
  if (authLoopbackPort) {
    authUrl.searchParams.set('desktop_loopback', String(authLoopbackPort));
  }
  return {
    authUrl: `${authUrl.pathname}${authUrl.search}`,
    pendingPkce: pkce,
  };
}

function buildCentralDesktopAuthUrl(
  intent: DesktopAuthIntent,
  returnTo: string
): string {
  const created = createCentralDesktopAuthRoute(intent, returnTo);
  rememberDesktopAuthPkce(created.pendingPkce);
  return created.authUrl;
}

function resolveDesktopBrowserAuthUrl(urlString: string) {
  const resolution = resolveDesktopBrowserAuthRoute({
    state: desktopBrowserAuthRouteState,
    urlString,
    appOrigin: APP_ORIGIN,
    authStartPath: DESKTOP_AUTH_START_PATH,
    flowParam: DESKTOP_AUTH_FLOW_PARAM,
    returnParam: DESKTOP_RETURN_PARAM,
    parseUrl,
    isDesktopAuthPath,
    sanitizeReturnRoute: sanitizeDesktopReturnRoute,
    matchesPathPrefix,
    createCentralRoute: createCentralDesktopAuthRoute,
  });
  desktopBrowserAuthRouteState = resolution.state;
  if (resolution.created) recentAuthCompletion = null;
  return resolution;
}

function buildDesktopBrowserAuthUrl(urlString: string): string | null {
  const resolution = resolveDesktopBrowserAuthUrl(urlString);
  return resolution.ok ? resolution.authUrl : null;
}

function buildDesktopAuthHandoffUrl(authUrl: string): string {
  const url = new URL(DESKTOP_AUTH_HANDOFF_PATH, APP_URL);
  url.searchParams.set('auth_url', authUrl);
  // UI hint only, so the handoff renders its Touch ID row without a layout
  // shift. WebAuthn itself decides whether sign-in works.
  if (desktopPasskeyAvailable && readDesktopPasskeyState().enrolled) {
    url.searchParams.set('touch_id', '1');
  }
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

function findLegacyAuthReturnRouteInArgv(
  argv: readonly string[]
): string | null {
  for (const arg of argv) {
    const route = parseLegacyAuthReturnRouteDeepLink(arg);
    if (route) return route;
  }
  return null;
}

// Chromium's Web Speech recognition backend needs Google API keys that
// Electron cannot ship, so `webkitSpeechRecognition` exists in the renderer
// but every start() fails with a 'network' error (electron/electron#46143,
// #7749). Advertising it as a fallback made the composer mic look live and
// fail on every press. Report it unavailable so the renderer points at OS
// dictation instead — macOS dictation types into any focused field here.
function getDesktopDictationStatus(): DesktopDictationStatus {
  return {
    ok: true,
    nativeAvailable: false,
    webSpeechFallbackAllowed: false,
    mode: 'unavailable',
    reason:
      process.platform === 'darwin'
        ? 'web-speech-unsupported-in-electron-use-macos-system-dictation'
        : 'web-speech-unsupported-in-electron-use-system-dictation',
  };
}

const WINDOW_STATE_FILE = path.join(
  app.getPath('userData'),
  'window-state.json'
);

function getAppIconPath(): string | undefined {
  return APP_ICON_AVAILABLE ? APP_ICON_PATH : undefined;
}

const windowStateStore = createWindowStateStore({
  filePath: WINDOW_STATE_FILE,
});
let windowStateQuitFlushed = false;

async function hydrateWindowState(): Promise<WindowState> {
  const displayBounds = screen.getPrimaryDisplay().workArea;
  const connectedDisplays = screen
    .getAllDisplays()
    .map(display => display.workArea);
  return windowStateStore.load({
    displayBounds,
    connectedDisplays,
    report: reportDesktopSecurityEvent,
  });
}

function saveWindowState(win: BrowserWindow): void {
  // A minimized window reports garbage bounds (x: -32000 on Windows); keep the
  // last good state instead. getNormalBounds() returns the pre-maximize /
  // pre-fullscreen bounds so those transient states are never persisted.
  if (win.isMinimized()) return;
  const bounds = win.getNormalBounds();
  windowStateStore.scheduleSave(
    persistNativeFullscreen(
      {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      win.isFullScreen()
    )
  );
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

function isAuthHandoffInteractive(): boolean {
  return shouldSkipRendererWatchdogForAuthHandoff({
    handoffOpen: isAuthHandoffOpen(),
    handoffVisible: Boolean(
      authHandoffWindow &&
        !authHandoffWindow.isDestroyed() &&
        authHandoffWindow.isVisible()
    ),
  });
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
    const recovery = authNavigationRecoveries.get(mainWindow.webContents.id);
    const interruptedTarget = recovery?.cancel();
    if (interruptedTarget) {
      const completed = recovery!.navigationCompletion();
      void mainWindow.loadURL(interruptedTarget).then(completed, () => {});
    } else if (
      shouldRecoverAuthHandoffToCanonicalShell(mainWindow.webContents.getURL())
    ) {
      const authUrl = buildCentralDesktopAuthUrl('sign_in', '/app');
      void mainWindow.loadURL(buildDesktopAuthHandoffUrl(authUrl));
    }
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
        }) ||
          shouldGrantTrustedHudScreenPermission({
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
      }) ||
      shouldGrantTrustedHudScreenPermissionCheck({
        permission,
        details,
        webContents,
        requestingOrigin,
        parseUrl,
        appOrigin: APP_ORIGIN,
      })
  );

  // Permission request/check handlers above authorize the HUD document before
  // Electron invokes its system-picker wrapper (which bypasses this fallback).
  session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      // macOS <15 and unsupported platforms must never select a default screen.
      try {
        callback({});
      } catch {
        // Electron rejects the renderer request and also throws for no video.
      }
    },
    { useSystemPicker: true }
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
  // Successful auth owns its returned route; cancellation recovery must not
  // replay the earlier interrupted navigation when the handoff closes.
  authNavigationRecoveries.get(win.webContents.id)?.clear();

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
  if (desktopBrowserAuthRouteState.recoveryNavigationPending) return;
  const win =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  showWindow(win);
  showDesktopAuthHandoff(buildCentralDesktopAuthUrl('sign_in', '/app'), {
    recoveryNavigation: true,
  });
}

type DesktopAuthCompletionOutcome =
  | 'completed'
  // The loopback request and the deep link can deliver the same code; the
  // second arrival is still a successful sign-in, not a fresh handoff.
  | 'duplicate'
  | 'no-pending-flow'
  | 'pkce-expired'
  | 'flow-mismatch';

function handleAuthCompletion(
  completion: NonNullable<ReturnType<typeof parseDesktopAuthReturnDeepLink>>
): DesktopAuthCompletionOutcome {
  if (completion.code === lastCompletedAuthCode) return 'duplicate';

  const binding = bindPendingDesktopAuthCompletion(
    desktopBrowserAuthRouteState.pendingPkce,
    completion
  );

  if (!binding.ok) {
    reportDesktopAuthBindingFailure(reportDesktopSecurityEvent, binding);
    if (binding.reason === 'pkce-expired') {
      // The pending flow is dead either way. Replace it with a fresh handoff
      // so the user is not stranded after returning from an expired browser.
      clearPendingDesktopAuthFlow();
      surfaceNoPendingAuthFlow();
    } else if (binding.reason === 'no-pending-flow') {
      surfaceNoPendingAuthFlow();
    }
    // 'flow-mismatch' (a forged-but-well-formed deep link) must NOT clear the
    // legitimate in-flight login — leave the pending PKCE state untouched.
    return binding.reason === 'invalid-params'
      ? 'flow-mismatch'
      : binding.reason;
  }

  clearPendingDesktopAuthFlow();
  lastCompletedAuthCode = completion.code;

  const nativeCompletion: DesktopAuthCompletion = {
    code: completion.code,
    state: completion.state,
    codeVerifier: binding.codeVerifier,
  };

  if (app.isReady()) {
    loadAuthCompletion(nativeCompletion);
    return 'completed';
  }

  pendingAuthCompletion = nativeCompletion;
  return 'completed';
}

const DESKTOP_PASSKEY_STATE_FILE = path.join(
  app.getPath('userData'),
  'desktop-passkey.json'
);

// Loaded once when Touch ID is configured; writes keep it current. The
// main process never blocks on disk after startup.
let desktopPasskeyState = parseDesktopPasskeyState(undefined);

function readDesktopPasskeyState(): DesktopPasskeyState {
  return desktopPasskeyState;
}

async function writeDesktopPasskeyState(
  state: DesktopPasskeyState
): Promise<boolean> {
  try {
    await fs.promises.writeFile(
      DESKTOP_PASSKEY_STATE_FILE,
      JSON.stringify(state),
      { mode: 0o600 }
    );
    desktopPasskeyState = state;
    return true;
  } catch {
    return false;
  }
}

// Touch ID sign-in (JOV-6727, docs/macos/desktop-auth.md). Only a signed
// build that embeds the Developer ID provisioning profile may use the
// keychain-access-groups entitlement; without it, stay off.
async function configureDesktopWebAuthn(): Promise<void> {
  const config = resolveDesktopWebAuthnConfig({
    platform: process.platform,
    isPackaged: app.isPackaged,
    appEnv: APP_ENV,
    hasEmbeddedProvisioningProfile: await fs.promises
      .access(path.join(process.resourcesPath, '..', 'embedded.provisionprofile'))
      .then(
        () => true,
        () => false
      ),
  });
  if (!config) return;

  try {
    app.configureWebAuthn({ touchID: config });
    desktopPasskeyAvailable = true;
    try {
      desktopPasskeyState = parseDesktopPasskeyState(
        await fs.promises.readFile(DESKTOP_PASSKEY_STATE_FILE, 'utf8')
      );
    } catch {
      // No state yet: not enrolled, never asked.
    }
  } catch (error) {
    console.error('[Jovie Desktop] Touch ID WebAuthn unavailable', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  session.defaultSession.on(
    'select-webauthn-account',
    (_event, details, callback) => {
      // The request hangs until the callback runs, so every path calls it.
      const choice = describeWebAuthnAccounts(details.accounts);
      if (choice.kind !== 'choose') {
        callback(choice.kind === 'single' ? choice.credentialId : undefined);
        return;
      }
      const options = {
        type: 'question' as const,
        message: 'Choose an account',
        buttons: [...choice.labels, 'Cancel'],
        defaultId: 0,
        cancelId: choice.labels.length,
      };
      const parent = BrowserWindow.getFocusedWindow();
      (parent
        ? dialog.showMessageBox(parent, options)
        : dialog.showMessageBox(options)
      )
        .then(({ response }) =>
          callback(details.accounts[response]?.credentialId)
        )
        .catch(() => callback());
    }
  );
}

function loadReturnedRoute(route: string): void {
  const targetUrl = new URL(route, APP_URL).toString();
  const win =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : createWindow(targetUrl);

  // Successful handback owns its returned route, not the interrupted old one.
  authNavigationRecoveries.get(win.webContents.id)?.clear();
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

function showDesktopAuthHandoff(
  authUrl: string,
  options: { readonly recoveryNavigation?: boolean } = {}
): void {
  const handoffUrl = buildDesktopAuthHandoffUrl(authUrl);
  hideMainWindowForAuthHandoff();

  if (authHandoffWindow && !authHandoffWindow.isDestroyed()) {
    const recoveryWindow = authHandoffWindow;
    if (options.recoveryNavigation) {
      desktopBrowserAuthRouteState = setDesktopAuthRecoveryNavigationPending(
        desktopBrowserAuthRouteState,
        true
      );
    }
    const finishRecoveryNavigation = () => {
      if (authHandoffWindow !== recoveryWindow) return;
      desktopBrowserAuthRouteState = setDesktopAuthRecoveryNavigationPending(
        desktopBrowserAuthRouteState,
        false
      );
    };
    void recoveryWindow
      .loadURL(handoffUrl)
      .then(finishRecoveryNavigation, finishRecoveryNavigation);
    showWindow(authHandoffWindow);
    return;
  }

  const authDisplay =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  authHandoffWindow = new BrowserWindow({
    show: false,
    ...authHandoffWindowBounds(authDisplay.workArea),
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

  authHandoffWindow.webContents.setUserAgent(
    `${authHandoffWindow.webContents.getUserAgent()} ${DESKTOP_USER_AGENT_PRODUCT}`
  );

  attachRendererRecovery(authHandoffWindow, {
    shouldSkipWatchdog: () => false,
  });

  authHandoffWindow.once('ready-to-show', () => {
    hideMainWindowForAuthHandoff();
    if (authHandoffWindow) showWindow(authHandoffWindow);
  });

  authHandoffWindow.on('closed', () => {
    authHandoffWindow = null;
    clearPendingDesktopAuthFlow();
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

  loadHostedUrlAfterSplash(authHandoffWindow, handoffUrl);
  showWindow(authHandoffWindow);
}

function maybeShowDesktopAuthHandoff(urlString: string): boolean {
  const authUrl = buildDesktopBrowserAuthUrl(urlString);
  if (!authUrl) return false;

  showDesktopAuthHandoff(authUrl);
  return true;
}

function interceptMainWindowAuthNavigation(
  win: BrowserWindow,
  url: string
): boolean {
  const authUrl = buildDesktopBrowserAuthUrl(url);
  if (!authUrl) return false;
  const recovery = authNavigationRecoveries.get(win.webContents.id);
  const action = recovery?.authIntercepted();
  if (action === 'ignore') return true;
  if (action === 'canonical-auth-shell') {
    // A failed one-shot retry remains recoverable in this window, not a loop
    // of newly opened handoffs. Existing server auth checks remain authority.
    const completed = recovery!.navigationCompletion();
    void win.loadURL(buildDesktopAuthHandoffUrl(authUrl)).then(completed, () => {});
    showWindow(win);
  } else {
    showDesktopAuthHandoff(authUrl);
  }
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

function buildDesktopShellHtml(input: {
  readonly title: string;
  readonly heading: string;
  readonly body: string;
  readonly actions?: string;
  readonly identityHtml?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${input.title}</title>
    <style>
      :root { color-scheme: dark; --system-b-bg-base: ${SYSTEM_B_DESKTOP_TOKENS.backgroundColor}; --system-b-text-primary: ${SYSTEM_B_DESKTOP_TOKENS.textPrimary}; --system-b-text-secondary: ${SYSTEM_B_DESKTOP_TOKENS.textSecondary}; --system-b-primary-bg: ${SYSTEM_B_DESKTOP_TOKENS.primaryBackground}; --system-b-primary-fg: ${SYSTEM_B_DESKTOP_TOKENS.primaryForeground}; --system-b-radius-pill: ${SYSTEM_B_DESKTOP_TOKENS.radiusPill}; --system-b-mark-cream: ${SYSTEM_B_DESKTOP_TOKENS.markCream}; }
      html, body { margin: 0; min-height: 100vh; background: var(--system-b-bg-base); color: var(--system-b-text-primary); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif; }
      body { display: grid; place-items: center; overflow: hidden; }
      .shell { position: relative; display: grid; width: min(420px, calc(100vw - 48px)); gap: 16px; padding: 32px 24px; text-align: center; justify-items: center; }
      .mark { width: ${SYSTEM_B_DESKTOP_TOKENS.splashMarkSizePx}px; height: ${SYSTEM_B_DESKTOP_TOKENS.splashMarkSizePx}px; color: var(--system-b-mark-cream); }
      .copy { position: relative; display: grid; gap: 8px; justify-items: center; }
      h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
      p { margin: 0; max-width: 34ch; color: var(--system-b-text-secondary); font-size: 13px; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
      a { display: inline-flex; height: 34px; align-items: center; justify-content: center; border-radius: var(--system-b-radius-pill); padding: 0 13px; color: var(--system-b-text-primary); font-size: 12px; font-weight: 590; text-decoration: none; }
      .primary { background: var(--system-b-primary-bg); color: var(--system-b-primary-fg); }
      .secondary { color: var(--system-b-text-secondary); }
      ${DESKTOP_BUILD_IDENTITY_SHELL_CSS}
    </style>
  </head>
  <body>
    <main class="shell" role="main">
      <svg class="mark" viewBox="0 0 353.68 347.97" aria-hidden="true">
        <path fill="currentColor" d="${JOVIE_MARK_SVG_PATH}"/>
      </svg>
      <div class="copy">
        <h1>${input.heading}</h1>
        <p>${input.body}</p>
      </div>
      ${input.identityHtml ?? ''}
      ${input.actions ?? ''}
    </main>
  </body>
</html>`;
}

function buildDesktopLoadFailureUrl(failure: DesktopLoadFailureView): string {
  const retryUrl = escapeHtmlAttribute(APP_ENTRY_URL);
  const appOrigin = escapeHtmlAttribute(APP_ORIGIN);
  const html = buildDesktopShellHtml({
    title: 'Jovie Desktop',
    heading: failure.heading,
    body: failure.body,
    actions: `<div class="actions">
        <a class="primary" href="${retryUrl}">Retry</a>
        <a class="secondary" href="${appOrigin}">Open Jovie</a>
      </div>`,
  });

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

// Resolved once at startup (see preloadDesktopBootSplashWordmark) so the
// splash builder stays synchronous without a thread-blocking file read.
let desktopBootSplashWordmarkDataUrl: string | null = null;

function resolveDesktopBootSplashWordmarkPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'Jovie-Wordmark-Cream.svg')
    : path.join(
        __dirname,
        '..',
        '..',
        'web',
        'public',
        'brand',
        'Jovie-Wordmark-Cream.svg'
      );
}

async function preloadDesktopBootSplashWordmark(): Promise<void> {
  try {
    const wordmark = await fs.promises.readFile(
      resolveDesktopBootSplashWordmarkPath()
    );
    desktopBootSplashWordmarkDataUrl = `data:image/svg+xml;base64,${wordmark.toString('base64')}`;
  } catch {
    // Keep first paint usable if a development or damaged package lacks the asset.
    desktopBootSplashWordmarkDataUrl = null;
  }
}

function buildDesktopBootSplashHtml(): string {
  const markCream = SYSTEM_B_DESKTOP_TOKENS.markCream;
  const cornerMarkPx = SYSTEM_B_DESKTOP_TOKENS.macCornerMarkSizePx;
  const cornerMarkOpacity = SYSTEM_B_DESKTOP_TOKENS.macCornerMarkOpacity;
  const wordmarkDataUrl = desktopBootSplashWordmarkDataUrl;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jovie</title>
    <style>
      :root { color-scheme: dark; --mac-canvas: ${SYSTEM_B_DESKTOP_TOKENS.macCinematicCanvas}; --mac-ion: #11AFFF; --mac-cream: ${markCream}; }
      html, body { margin: 0; width: 100%; min-height: 100%; background: var(--mac-canvas); }
      body { min-height: 100vh; overflow: hidden; color: var(--mac-cream); font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; }
      main { position: relative; display: grid; min-height: 100vh; place-items: center; isolation: isolate; background: radial-gradient(ellipse 78% 34% at 52% -8%, rgba(17,175,255,.30), transparent 76%), radial-gradient(ellipse 44% 24% at 88% 4%, rgba(17,175,255,.18), transparent 80%), var(--mac-canvas); }
      main::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 85% 90% at 50% 46%, transparent 55%, rgba(3,4,7,.72)); }
      .corner-mark { position: absolute; top: min(32px, 1.43vw); right: min(32px, 1.43vw); width: min(${cornerMarkPx}px, 1.786vw); height: min(${cornerMarkPx}px, 1.786vw); opacity: ${cornerMarkOpacity}; color: var(--mac-cream); }
      .lockup-area { position: relative; display: grid; justify-items: center; gap: min(24px, 1.07vw); width: 100%; }
      .lockup { display: flex; width: min(249px, 11.12vw); align-items: center; justify-content: flex-start; gap: min(12px, .536vw); white-space: nowrap; }
      .wordmark { display: block; width: min(104px, 4.64vw); height: auto; flex: none; }
      .fallback-mark { width: min(32px, 1.43vw); height: min(32px, 1.43vw); color: var(--mac-cream); }
      .suffix { font-size: min(38px, 1.7vw); line-height: 1.15; font-weight: 400; letter-spacing: -.8px; }
      .progress { width: min(120px, 5.36vw); height: 2px; overflow: hidden; background: rgba(255,255,255,.2); }
      .progress::before { content: ""; display: block; width: min(44px, 1.96vw); height: 2px; background: var(--mac-ion); }
    </style>
  </head>
  <body>
    <main role="main" aria-label="Jovie for Mac is loading" data-desktop-splash="cinematic">
      <svg class="corner-mark" viewBox="0 0 353.68 347.97" aria-hidden="true">
        <path fill="currentColor" d="${JOVIE_MARK_SVG_PATH}"/>
      </svg>
      <div class="lockup-area" aria-hidden="true">
        ${wordmarkDataUrl ? `<div class="lockup"><img class="wordmark" src="${wordmarkDataUrl}" alt="" /><span class="suffix">for Mac</span></div>` : `<svg class="fallback-mark" viewBox="0 0 353.68 347.97" aria-hidden="true"><path fill="currentColor" d="${JOVIE_MARK_SVG_PATH}"/></svg>`}
        <div class="progress"></div>
      </div>
    </main>
  </body>
</html>`;
}

function buildDesktopBootSplashUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildDesktopBootSplashHtml())}`;
}

function buildDesktopAboutUrl(): string {
  const body =
    desktopBuildIdentity.provenance === 'verified'
      ? 'Packaged build identity'
      : desktopBuildIdentity.provenance === 'development'
        ? 'Development build — build time unavailable'
        : 'Build identity unverified';
  const html = buildDesktopShellHtml({
    title: `About ${getDesktopAppDisplayName()}`,
    heading: getDesktopAppDisplayName(),
    body,
    identityHtml: renderDesktopBuildIdentitySection(desktopBuildIdentity),
  });
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function persistDesktopBuildIdentityEvidence(): Promise<void> {
  try {
    await fs.promises.writeFile(
      path.join(app.getPath('userData'), DESKTOP_BUILD_IDENTITY_RESOURCE_NAME),
      toDesktopBuildIdentityJson(desktopBuildIdentity)
    );
  } catch (error) {
    console.warn(
      '[jovie-desktop-build-identity] could not persist evidence',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function showDesktopAboutWindow(): void {
  if (process.platform === 'darwin') {
    app.showAboutPanel();
    return;
  }

  if (aboutWindow && !aboutWindow.isDestroyed()) {
    showWindow(aboutWindow);
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: APP_BACKGROUND_COLOR,
    show: false,
    title: `About ${getDesktopAppDisplayName()}`,
    webPreferences: {
      contextIsolation: true,
      devTools: ENABLE_DEVTOOLS,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  aboutWindow.once('ready-to-show', () => {
    if (aboutWindow && !aboutWindow.isDestroyed()) showWindow(aboutWindow);
  });
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
  aboutWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  aboutWindow.webContents.on('will-navigate', event => {
    event.preventDefault();
  });
  void aboutWindow.loadURL(buildDesktopAboutUrl());
}

function loadHostedUrlAfterSplash(win: BrowserWindow, hostedUrl: string): void {
  const navigateToHosted = (): void => {
    if (win.isDestroyed()) return;
    void win.loadURL(hostedUrl);
  };

  if (win.webContents.getURL().startsWith('data:text/html')) {
    navigateToHosted();
    return;
  }

  win.webContents.once('did-finish-load', navigateToHosted);
  void win.loadURL(buildDesktopBootSplashUrl());
}

function showDesktopLoadFailure(
  win: BrowserWindow,
  failure: DesktopLoadFailureView = describeDesktopLoadFailure(
    'unknown',
    APP_URL
  )
): void {
  if (win.isDestroyed()) return;
  void win.loadURL(buildDesktopLoadFailureUrl(failure));
  rendererBootControllers.get(win.webContents.id)?.beginRecoveryUnlatch();
}

async function probeAppUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function findReachableHostedUrl(
  hostedUrl: string
): Promise<string | null> {
  for (const candidate of hostedUrlCandidates(APP_URL, hostedUrl)) {
    const origin = new URL(candidate).origin;
    if (
      await probeAppUrl(new URL('/api/health/build-info', origin).toString())
    ) {
      return candidate;
    }
    if (await probeAppUrl(origin)) {
      return candidate;
    }
    if (await probeAppUrl(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function isAppOriginReachable(): Promise<boolean> {
  return (await findReachableHostedUrl(APP_ENTRY_URL)) !== null;
}

function resolveLoadFailureView(
  reason: DesktopLoadFailureReason,
  options: {
    readonly errorCode?: number;
    readonly hostReachable?: boolean;
  } = {}
): DesktopLoadFailureView {
  const kind = classifyDesktopLoadFailure({
    reason,
    errorCode: options.errorCode,
    appEnv: APP_ENV,
    appUrl: APP_URL,
    hostReachable: options.hostReachable,
  });
  return describeDesktopLoadFailure(kind, APP_URL);
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

function isWebBuildReloadWindow(win: BrowserWindow): boolean {
  if (win.isDestroyed()) return false;
  const parsed = parseUrl(win.webContents.getURL());
  return (
    parsed?.origin === APP_ORIGIN && isWebBuildReloadPath(parsed.pathname)
  );
}

/** Auth remains main-owned even when the chat renderer is hidden or idle. */
function hasPendingDesktopAuthentication(): boolean {
  return Boolean(
    isAuthHandoffOpen() ||
    desktopBrowserAuthRouteState.pendingPkce ||
    desktopBrowserAuthRouteState.recoveryNavigationPending ||
    pendingAuthCompletion ||
    pendingLegacyAuthReturnRoute
  );
}

/** Unknown state, draft probe failures and navigation during a probe block reload. */
async function windowWorkStateSafe(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed() || win.webContents.isLoadingMainFrame()) return false;
  const contents = win.webContents;
  const generation = workDocumentGenerations.get(contents);
  return probeSessionWorkSafety({
    read: () => contents.executeJavaScript(SESSION_WORK_PROBE),
    isCurrentDocument: () =>
      !win.isDestroyed() &&
      !contents.isLoadingMainFrame() &&
      generation === workDocumentGenerations.get(contents),
    isAuthenticating: hasPendingDesktopAuthentication,
    now: Date.now,
  });
}

function allWindowWorkStateSafe(): Promise<boolean> {
  return probeAllWindowWorkSafety({
    getWindows: () => BrowserWindow.getAllWindows().filter(
      win => win === mainWindow || isWebBuildReloadWindow(win)
    ),
    getGeneration: win => workDocumentGenerations.get(win.webContents),
    isLoading: win => win.isDestroyed() || win.webContents.isLoadingMainFrame(),
    probe: windowWorkStateSafe,
    isAuthenticating: hasPendingDesktopAuthentication,
  });
}

function anyWindowAudible(): boolean {
  return BrowserWindow.getAllWindows().some(
    win => !win.isDestroyed() && win.webContents.isCurrentlyAudible()
  );
}

async function reloadIdleWindowsForWebBuildChange(): Promise<void> {
  const liveIds = new Set<number>();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!isWebBuildReloadWindow(win)) continue;
    const id = win.webContents.id;
    liveIds.add(id);
    if (!webBuildReloadPending.has(id)) continue;

    const workStateSafe = await windowWorkStateSafe(win);
    if (win.isDestroyed()) continue;
    const isHud = isHudWindow(win);
    const reload = shouldReloadWindowForWebBuild({
      isHud,
      visible: win.isVisible() && !win.isMinimized(),
      focused: win.isFocused(),
      audible: win.webContents.isCurrentlyAudible(),
      hasUnsentInput: false, // Included in the request-time work probe.
      workStateSafe,
      systemIdleSeconds: powerMonitor.getSystemIdleTime(),
    });
    if (reload && !win.isDestroyed()) {
      webBuildReloadPending.delete(id);
      win.webContents.reload();
    }
  }
  for (const id of webBuildReloadPending) {
    if (!liveIds.has(id)) webBuildReloadPending.delete(id);
  }
}

const checkHudBuildAndReload = singleFlight(async () => {
  const reloadable = BrowserWindow.getAllWindows().filter(
    isWebBuildReloadWindow
  );
  if (reloadable.length === 0) {
    webBuildReloadPending.clear();
    return;
  }

  const nextFingerprint = await fetchHudBuildFingerprint();
  const decision = decideHudBuildReload({
    currentFingerprint: currentHudBuildFingerprint,
    nextFingerprint,
  });
  currentHudBuildFingerprint = decision.nextFingerprint;

  if (decision.shouldReload) {
    for (const win of reloadable) {
      if (!win.isDestroyed()) webBuildReloadPending.add(win.webContents.id);
    }
  }
  if (webBuildReloadPending.size > 0) {
    await reloadIdleWindowsForWebBuildChange();
  }
});

function showPublicProfilePreview(urlString: string): boolean {
  const canonicalUrl = canonicalPublicProfileUrl(urlString);
  if (!canonicalUrl) return false;

  if (publicProfilePreviewWindow && !publicProfilePreviewWindow.isDestroyed()) {
    if (publicProfilePreviewWindow.webContents.getURL() !== canonicalUrl) {
      void publicProfilePreviewWindow.loadURL(canonicalUrl);
    }
    showWindowNow(publicProfilePreviewWindow);
    return true;
  }

  const previewSession = session.fromPartition(
    PUBLIC_PROFILE_PREVIEW_PARTITION,
    { cache: true }
  );
  previewSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false)
  );
  previewSession.setPermissionCheckHandler(() => false);

  const preview = new BrowserWindow({
    show: false,
    ...PUBLIC_PROFILE_PREVIEW_BOUNDS,
    resizable: true,
    title: 'Jovie Public Profile',
    backgroundColor: APP_BACKGROUND_COLOR,
    webPreferences: {
      session: previewSession,
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
  publicProfilePreviewWindow = preview;
  preview.webContents.setUserAgent(
    `${preview.webContents.getUserAgent()} ${DESKTOP_USER_AGENT_PRODUCT}`
  );

  preview.webContents.on('will-navigate', (event, url) => {
    const navigationUrl = resolveNavigationUrl(url);
    const disposition = getUrlDisposition(navigationUrl);
    if (disposition === 'profile-preview') return;
    event.preventDefault();
    if (disposition === 'external') void openExternalUrl(navigationUrl);
  });
  preview.webContents.on('will-frame-navigate', event => {
    if (event.isMainFrame) return;
    event.preventDefault();
  });
  preview.webContents.on(
    'will-redirect',
    (event, url, _inPlace, isMainFrame) => {
      const navigationUrl = resolveNavigationUrl(url);
      if (getUrlDisposition(navigationUrl) === 'profile-preview') return;
      event.preventDefault();
      if (isMainFrame && getUrlDisposition(navigationUrl) === 'external') {
        void openExternalUrl(navigationUrl);
      }
    }
  );
  preview.webContents.setWindowOpenHandler(({ url }) => {
    const navigationUrl = resolveNavigationUrl(url);
    const disposition = getUrlDisposition(navigationUrl);
    if (disposition === 'profile-preview') void preview.loadURL(navigationUrl);
    else if (disposition === 'external') void openExternalUrl(navigationUrl);
    return { action: 'deny' };
  });
  preview.on('closed', () => {
    publicProfilePreviewWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) showWindowNow(mainWindow);
  });
  preview.once('ready-to-show', () => showWindowNow(preview));
  void preview.loadURL(canonicalUrl);
  return true;
}

function attachRendererRecovery(
  win: BrowserWindow,
  options: {
    readonly shouldSkipWatchdog: () => boolean;
    readonly onAbortedMainFrame?: (validatedURL: string) => boolean;
  }
): void {
  let rendererCrashReloadCount = 0;
  let hostedLoadRetryCount = 0;
  let retryingHostedLoad = false;
  let rendererBooted = false;
  let rendererEverBooted = false;
  let lastHostedUrl = APP_ENTRY_URL;
  let bootWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let loadWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryUnlatchTimer: ReturnType<typeof setTimeout> | null = null;
  const armWatchdogs = shouldArmRendererWatchdogsForAppEnv(APP_ENV);
  const webContentsId = win.webContents.id;
  const localHostedLoadRecovery = createLocalHostedLoadRetryController({
    retry: retryUrl => {
      if (win.isDestroyed()) return;
      void win.loadURL(retryUrl);
    },
    isWindowDestroyed: () => win.isDestroyed(),
  });

  const clearBootWatchdog = (): void => {
    if (bootWatchdogTimer !== null) {
      clearTimeout(bootWatchdogTimer);
      bootWatchdogTimer = null;
    }
  };

  const clearLoadWatchdog = (): void => {
    if (loadWatchdogTimer !== null) {
      clearTimeout(loadWatchdogTimer);
      loadWatchdogTimer = null;
    }
  };

  const clearAllWatchdogs = (): void => {
    clearBootWatchdog();
    clearLoadWatchdog();
  };

  const stopRecoveryUnlatch = (): void => {
    if (recoveryUnlatchTimer !== null) {
      clearTimeout(recoveryUnlatchTimer);
      recoveryUnlatchTimer = null;
    }
  };

  const beginRecoveryUnlatch = (): void => {
    stopRecoveryUnlatch();
    // First probe does not wait for the data: URL to commit. Recapture 5:52
    // PT had :3100 already warm while the recovery shell stayed latched.
    let recoveryArmed = true;
    const poll = (): void => {
      if (win.isDestroyed() || rendererBooted) {
        stopRecoveryUnlatch();
        return;
      }
      void findReachableHostedUrl(lastHostedUrl).then(reachableHostedUrl => {
        if (win.isDestroyed() || rendererBooted) {
          stopRecoveryUnlatch();
          return;
        }
        const action = decideRecoveryUnlatch({
          showingFailurePage:
            recoveryArmed ||
            win.webContents.getURL().startsWith('data:text/html'),
          booted: rendererBooted,
          windowDestroyed: win.isDestroyed(),
          reachableHostedUrl,
        });
        if (action === 'reload-hosted' && reachableHostedUrl) {
          recoveryArmed = false;
          lastHostedUrl = reachableHostedUrl;
          void win.loadURL(reachableHostedUrl);
          return;
        }
        recoveryUnlatchTimer = setTimeout(poll, RECOVERY_UNLATCH_POLL_MS);
      });
    };
    poll();
  };

  const recoverOrShowFailure = (
    reason: DesktopLoadFailureReason,
    failureOptions: {
      readonly errorCode?: number;
      readonly hostReachable?: boolean;
    } = {}
  ): void => {
    if (rendererBooted || win.isDestroyed()) return;
    const failure = resolveLoadFailureView(reason, failureOptions);
    const retryAction = decideHostedLoadRetry({
      kind: failure.kind,
      retryCount: hostedLoadRetryCount,
      maxRetries: MAX_HOSTED_LOAD_RETRIES,
    });
    if (retryAction === 'retry' && !win.isDestroyed()) {
      hostedLoadRetryCount += 1;
      retryingHostedLoad = true;
      const retryUrl = lastHostedUrl;
      const reload = (): void => {
        if (win.isDestroyed()) return;
        void win.loadURL(retryUrl);
      };
      if (HOSTED_LOAD_RETRY_DELAY_MS > 0) {
        setTimeout(reload, HOSTED_LOAD_RETRY_DELAY_MS);
      } else {
        reload();
      }
      return;
    }
    showDesktopLoadFailure(win, failure);
    if (win === mainWindow) {
      showWindowNow(win);
    }
  };

  const expireWatchdog = (reason: 'load' | 'boot', url: string): void => {
    const action = decideRendererWatchdogExpiry({
      booted: rendererBooted,
      everBooted: rendererEverBooted,
      reason,
      windowDestroyed: win.isDestroyed(),
      skipForAuthHandoff: options.shouldSkipWatchdog(),
    });
    if (action === 'ignore') return;

    console.error(
      reason === 'load'
        ? '[Jovie Desktop] Renderer load watchdog expired'
        : '[Jovie Desktop] Renderer boot watchdog expired',
      {
        reason,
        url: url.split('?')[0],
        timeoutMs:
          reason === 'load'
            ? RENDERER_LOAD_WATCHDOG_MS
            : RENDERER_BOOT_WATCHDOG_MS,
      }
    );
    void isAppOriginReachable().then(hostReachable => {
      if (win.isDestroyed()) return;
      // The probe is async. A healthy first compile can send app-booted
      // while it is in flight — do not replace that painted session.
      if (
        decideRendererWatchdogExpiry({
          booted: rendererBooted,
          everBooted: rendererEverBooted,
          reason,
          windowDestroyed: win.isDestroyed(),
          skipForAuthHandoff: options.shouldSkipWatchdog(),
        }) === 'ignore'
      ) {
        return;
      }
      recoverOrShowFailure(
        reason === 'load' ? 'load-watchdog' : 'boot-watchdog',
        { hostReachable }
      );
    });
  };

  const armLoadWatchdog = (url: string): void => {
    clearAllWatchdogs();
    rendererBooted = false;
    if (!retryingHostedLoad) {
      hostedLoadRetryCount = 0;
    }
    retryingHostedLoad = false;
    if (!armWatchdogs) return;
    if (win.isDestroyed()) return;
    if (
      decideRendererLoadStart({
        url,
        appOrigin: APP_ORIGIN,
        isMainFrame: true,
        isInPlace: false,
      }) === 'ignore'
    ) {
      return;
    }

    loadWatchdogTimer = setTimeout(() => {
      loadWatchdogTimer = null;
      expireWatchdog('load', url);
    }, RENDERER_LOAD_WATCHDOG_MS);
  };

  const armBootWatchdog = (): void => {
    clearAllWatchdogs();
    if (!armWatchdogs) return;
    if (win.isDestroyed()) return;
    const url = win.webContents.getURL();
    const action = decideRendererBootWatchdogAfterLoad({
      booted: rendererBooted,
      url,
      appOrigin: APP_ORIGIN,
    });
    if (action !== 'arm-boot-watchdog') return;

    bootWatchdogTimer = setTimeout(() => {
      bootWatchdogTimer = null;
      expireWatchdog('boot', url);
    }, RENDERER_BOOT_WATCHDOG_MS);
  };

  const markRendererBooted = (): void => {
    rendererBooted = true;
    rendererEverBooted = true;
    rendererCrashReloadCount = 0;
    localHostedLoadRecovery.reset();
    hostedLoadRetryCount = 0;
    clearAllWatchdogs();
    stopRecoveryUnlatch();
  };

  rendererBootControllers.set(webContentsId, {
    markBooted: markRendererBooted,
    beginRecoveryUnlatch,
    dispose: () => {
      clearAllWatchdogs();
      localHostedLoadRecovery.dispose();
      stopRecoveryUnlatch();
      rendererBootControllers.delete(webContentsId);
    },
  });

  win.on('closed', () => {
    rendererBootControllers.get(webContentsId)?.dispose();
  });

  win.webContents.on('did-start-navigation', (...args: unknown[]) => {
    const navigation = parseDidStartNavigation(args);
    if (!navigation) return;
    if (
      decideRendererLoadStart({
        url: navigation.url,
        appOrigin: APP_ORIGIN,
        isMainFrame: navigation.isMainFrame,
        isInPlace: navigation.isInPlace,
      }) === 'arm-load-watchdog'
    ) {
      localHostedLoadRecovery.onHostedNavigationStarted();
      lastHostedUrl = navigation.url;
      armLoadWatchdog(navigation.url);
    }
  });

  // did-finish-load is unqualified and can arrive late for the splash or
  // Chromium error document. did-navigate carries the committed URL, so only
  // a positively identified hosted app document may complete local recovery.
  win.webContents.on('did-navigate', (_event, url) => {
    localHostedLoadRecovery.onMainFrameDocumentCommitted({
      isHostedAppDocument:
        decideRendererLoadStart({
          url,
          appOrigin: APP_ORIGIN,
          isMainFrame: true,
          isInPlace: false,
        }) === 'arm-load-watchdog',
    });
  });

  win.webContents.on('did-finish-load', () => {
    // Chromium still emits did-finish-load for chrome-error://chromewebdata/
    // after did-fail-load. That is not a hosted app load, so it must not arm
    // the boot watchdog. Local retry completion is owned by the URL-bearing
    // did-navigate handler above (JOV-5474).
    if (
      decideDidFinishLoadRecovery({ url: win.webContents.getURL() }) ===
      'ignore'
    ) {
      return;
    }
    armBootWatchdog();
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

        const recoveredViaAuthHandoff =
          typeof validatedURL === 'string' && options.onAbortedMainFrame
            ? options.onAbortedMainFrame(validatedURL)
            : false;
        const abortAction = decideAbortedMainFrameRecovery({
          recoveredViaAuthHandoff,
          currentUrl: win.webContents.getURL(),
        });
        if (abortAction === 'canonical-auth-shell') {
          const authUrl = buildCentralDesktopAuthUrl('sign_in', '/app');
          void win.loadURL(buildDesktopAuthHandoffUrl(authUrl));
          showWindowNow(win);
          return;
        }
        if (
          abortAction === 'arm-load-watchdog' &&
          typeof validatedURL === 'string'
        ) {
          armLoadWatchdog(resolveNavigationUrl(validatedURL));
        }
        return;
      }

      if (APP_ENV === 'local') {
        const retryUrl =
          typeof validatedURL === 'string' && validatedURL.startsWith('http')
            ? resolveNavigationUrl(validatedURL)
            : APP_ENTRY_URL;
        const localResult = localHostedLoadRecovery.onMainFrameLoadFailure({
          errorCode,
          retryUrl,
        });
        if (localResult.action === 'retry') {
          console.warn(
            '[Jovie Desktop] Local hosted load not ready, retrying',
            {
              errorCode,
              attempt: localResult.attempt,
              validatedURL:
                typeof validatedURL === 'string'
                  ? validatedURL.split('?')[0]
                  : validatedURL,
            }
          );
          // Chromium commits chrome-error://chromewebdata/ after a refused
          // loopback load. Keep the app-owned shell painted while the bounded
          // retry obligation remains active.
          void win.loadURL(buildDesktopBootSplashUrl());
          return;
        }
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
      recoverOrShowFailure('did-fail-load', { errorCode });
    }
  );

  win.webContents.on('render-process-gone', (_event, details) => {
    clearAllWatchdogs();
    localHostedLoadRecovery.reset();
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
    recoverOrShowFailure('crashed');
  });

  win.webContents.on('unresponsive', () => {
    console.warn('[Jovie Desktop] Renderer unresponsive', {
      url: win.webContents.getURL().split('?')[0],
    });
    if (win.isDestroyed()) return;
    if (!armWatchdogs) return;
    if (options.shouldSkipWatchdog()) return;
    clearAllWatchdogs();
    recoverOrShowFailure('unresponsive');
  });
}

let launchReadiness: ReturnType<typeof createDesktopLaunchReadiness> | null =
  null;

function readinessSender(
  event: IpcMainEvent | IpcMainInvokeEvent
): ReadinessSender {
  const frame = event.senderFrame;
  const win = mainWindow;
  const live = Boolean(win && !win.isDestroyed());
  return {
    isMainWindow: live && win?.webContents === event.sender,
    frame: frame
      ? {
          isMainFrame: frame === event.sender.mainFrame,
          detached: frame.detached,
          url: frame.url,
        }
      : null,
    appOrigin: APP_ORIGIN,
    visible: live && Boolean(win?.isVisible()),
    minimized: !live || Boolean(win?.isMinimized()),
    focused: live && Boolean(win?.isFocused()),
  };
}

function createWindow(initialUrl = APP_ENTRY_URL): BrowserWindow {
  if (!launchReadiness) {
    const writeReceipt = createLaunchReadinessWriter(
      path.join(app.getPath('userData'), DESKTOP_LAUNCH_READINESS_FILE),
      error =>
        console.warn(
          '[desktop-launch-readiness] Could not persist receipt',
          error
        )
    );
    launchReadiness = createDesktopLaunchReadiness({
      pid: process.pid,
      processTimeOrigin: new Date(performance.timeOrigin).toISOString(),
      nativeBuild: desktopBuildIdentity,
      now: () => performance.now(),
      onChange: receipt => {
        void writeReceipt(receipt);
        if (receipt.composerVisibleEditableAfterPaintOpportunityMs !== null) {
          startupMaintenance?.composerUsable();
        }
      },
    });
  }
  const windowState = windowStateStore.peek();

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
    // Use Electron's native window-controls bounds in the hosted titlebar.
    titleBarOverlay: process.platform === 'darwin' ? { height: 44 } : false,
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
    if (win.isDestroyed() || isAuthHandoffInteractive() || win.isVisible())
      return;
    const current = win.webContents.getURL();
    if (!current || current === 'about:blank') {
      const authUrl = buildCentralDesktopAuthUrl('sign_in', '/app');
      void win.loadURL(buildDesktopAuthHandoffUrl(authUrl));
    }
    showWindowNow(win);
  }, 6000);

  win.once('ready-to-show', () => {
    launchReadiness?.nativeWindowReadyToShow();
    clearTimeout(initialVisibilityFallback);
    if (isAuthHandoffInteractive()) {
      mainWindowHiddenForAuthHandoff = true;
      return;
    }
    showWindow(win);
    if (shouldRestoreNativeFullscreen(windowState) && !win.isDestroyed()) {
      win.setFullScreen(true);
    }
  });

  mainWindow = win;
  const navigationContentsId = win.webContents.id;
  win.webContents.on('render-process-gone', () => {
    desktopNavigation.setReady(navigationContentsId, false);
  });
  win.webContents.on('destroyed', () => {
    desktopNavigation.setReady(navigationContentsId, false);
  });
  const visualActivity = observeWindowVisualActivity(
    win,
    powerMonitor,
    active => {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(VISUAL_ACTIVITY_CHANNEL, active);
      }
    }
  );
  const visualContentsId = win.webContents.id;
  visualActivityReaders.set(visualContentsId, visualActivity.read);
  win.once('closed', () => visualActivityReaders.delete(visualContentsId));
  const authNavigationRecovery = createAuthHandoffNavigationRecovery(APP_ORIGIN);
  const authNavigationContentsId = win.webContents.id;
  authNavigationRecoveries.set(authNavigationContentsId, authNavigationRecovery);
  win.on('closed', () => {
    authNavigationRecovery.clear();
    authNavigationRecoveries.delete(authNavigationContentsId);
  });
  win.webContents.on('did-start-navigation', (...args: unknown[]) => {
    const navigation = parseDidStartNavigation(args);
    if (!navigation) return;
    if (navigation.isMainFrame && !navigation.isInPlace) {
      desktopNavigation.setReady(navigationContentsId, false);
    }
    authNavigationRecovery.navigationStarted({
      ...navigation,
      currentUrl: win.webContents.getURL(),
    });
  });
  win.webContents.on('did-finish-load', () => {
    if (!isChromiumErrorDocument(win.webContents.getURL())) {
      authNavigationRecovery.documentFinished();
    }
  });

  win.webContents.setUserAgent(
    `${win.webContents.getUserAgent()} ${DESKTOP_USER_AGENT_PRODUCT}`
  );

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Jovie Desktop] Preload failed', {
      preloadPath,
      reason: error instanceof Error ? error.message : String(error),
    });
  });

  attachRendererRecovery(win, {
    shouldSkipWatchdog: isAuthHandoffInteractive,
    onAbortedMainFrame: validatedURL =>
      interceptMainWindowAuthNavigation(win, resolveNavigationUrl(validatedURL)),
  });

  registerMainWindowPermissionHandlers(win.webContents.session);

  // Navigation guard: app-host routes stay in-window; auth routes get the
  // dedicated handoff; all other safe URLs open in the system browser.
  win.webContents.on('will-navigate', (event, url) => {
    const navigationUrl = resolveNavigationUrl(url);
    if (interceptMainWindowAuthNavigation(win, navigationUrl)) {
      event.preventDefault();
      return;
    }

    const disposition = getUrlDisposition(navigationUrl);
    if (disposition === 'profile-preview') {
      event.preventDefault();
      showPublicProfilePreview(navigationUrl);
      return;
    }

    if (shouldLoadDesktopAuthRouteInApp(navigationUrl)) {
      return;
    }

    if (disposition === 'in-app') return;

    event.preventDefault();
    if (disposition === 'external') {
      void openExternalUrl(navigationUrl);
    }
  });

  win.webContents.on('will-frame-navigate', event => {
    if (event.isMainFrame) {
      if (getUrlDisposition(event.url) === 'profile-preview') {
        event.preventDefault();
        showPublicProfilePreview(event.url);
      }
      return;
    }
    if (getUrlDisposition(event.url) === 'in-app') return;
    event.preventDefault();
  });

  win.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
    const navigationUrl = resolveNavigationUrl(url);
    if (isMainFrame && interceptMainWindowAuthNavigation(win, navigationUrl)) {
      event.preventDefault();
      return;
    }

    const disposition = getUrlDisposition(navigationUrl);
    if (disposition === 'profile-preview') {
      event.preventDefault();
      showPublicProfilePreview(navigationUrl);
      return;
    }
    if (shouldLoadDesktopAuthRouteInApp(navigationUrl)) {
      return;
    }

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
    if (disposition === 'profile-preview') {
      showPublicProfilePreview(url);
    } else if (disposition === 'in-app') {
      navigateInApp(win, url);
    } else if (disposition === 'external') {
      void openExternalUrl(url);
    }

    return { action: 'deny' };
  });

  win.on('resize', () => {
    saveWindowState(win);
  });
  win.on('move', () => {
    saveWindowState(win);
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

  if (
    packagedUsesCompetingStagingShell({
      appId: packagedDesktopAppId(APP_ENV),
      appEnv: APP_ENV,
      appUrl: APP_URL,
    })
  ) {
    showDesktopLoadFailure(win);
    return win;
  }

  const initialAuthUrl = buildDesktopBrowserAuthUrl(initialUrl);
  const hostedEntry = initialAuthUrl
    ? buildDesktopAuthHandoffUrl(initialAuthUrl)
    : initialUrl;
  if (initialAuthUrl) {
    showDesktopAuthHandoff(initialAuthUrl);
  }
  // Paint a local splash first so ready-to-show is never an empty black
  // canvas. The hosted entry loads after that first paint; the splash stays
  // visible until the hosted navigation commits or a watchdog recovers.
  loadHostedUrlAfterSplash(win, hostedEntry);

  return win;
}

function navigateInApp(win: BrowserWindow, url: string): void {
  if (win.isDestroyed()) return;
  const action = desktopNavigation.resolve(
    win.webContents.id,
    win.webContents.getURL(),
    url,
    URL_DISPOSITION_OPTIONS
  );
  if (action?.kind === 'client') {
    win.webContents.send(CLIENT_NAVIGATION_CHANNEL, action.path);
  } else if (action?.kind === 'document') {
    void win.loadURL(action.url);
  }
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

  navigateInApp(mainWindow, SETTINGS_URL);
  showWindow(mainWindow);
}

function refreshApplicationMenu(): void {
  Menu.setApplicationMenu(buildApplicationMenu());
}

function desktopUpdatesSupported(): boolean {
  return shouldScheduleDesktopAutoUpdate({
    appEnv: APP_ENV,
    platform: process.platform,
  });
}

function checkForUpdatesFromMenu(): void {
  if (!desktopUpdatesSupported()) {
    return;
  }

  if (updateReadyToInstall) {
    autoUpdater.quitAndInstall();
    return;
  }

  runDesktopUpdateCheck('notify');
}

function configureDesktopAutoUpdater(): void {
  if (!desktopUpdatesSupported()) {
    return;
  }

  if (APP_ENV === 'staging') {
    autoUpdater.allowPrerelease = true;
  }
  autoUpdater.allowDowngrade = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
}

/** Show the result of a menu-initiated check; a no-op for silent checks. */
function showManualUpdateCheckFeedback(
  outcome: 'not-available' | 'error'
): void {
  if (!pendingManualUpdateCheck) return;
  pendingManualUpdateCheck = false;

  const feedback = buildManualUpdateCheckFeedback(outcome);
  const options = {
    type: feedback.type,
    title: feedback.title,
    message: feedback.title,
    detail: feedback.message,
  };
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  void (parent
    ? dialog.showMessageBox(parent, options)
    : dialog.showMessageBox(options));
}

function runDesktopUpdateCheck(mode: 'silent' | 'notify'): void {
  if (!desktopUpdatesSupported()) {
    return;
  }

  // An explicit check before startup settles also fulfills queued auto work.
  startupMaintenance?.cancelPending('update-check');

  if (mode === 'notify') {
    pendingManualUpdateCheck = true;
  }

  lastDesktopUpdateCheckMs = Date.now();
  const pending =
    mode === 'notify'
      ? autoUpdater.checkForUpdatesAndNotify()
      : autoUpdater.checkForUpdates();
  pending.catch(() => {
    showManualUpdateCheckFeedback('error');
    if (nightlyUpdateLaunch) {
      app.quit();
    }
  });
}

function requestAutomaticDesktopUpdateCheck(): void {
  const check = () => runDesktopUpdateCheck('silent');
  if (startupMaintenance) startupMaintenance.request('update-check', check);
  else check();
}

function scheduleDesktopAutoUpdate(): void {
  configureDesktopAutoUpdater();
  // The application menu is available while window-state/assets hydrate,
  // before the startup gate exists. Honor an explicit check made there too.
  if (lastDesktopUpdateCheckMs === null) requestAutomaticDesktopUpdateCheck();

  const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
  const interval = setInterval(() => {
    void installDownloadedUpdateIfIdle();
    requestAutomaticDesktopUpdateCheck();
  }, UPDATE_INTERVAL_MS);
  interval.unref?.();

  // A laptop that slept through the interval checks as soon as it is back.
  const checkAfterWake = () => {
    if (
      shouldRunWakeUpdateCheck({
        nowMs: Date.now(),
        lastCheckMs: lastDesktopUpdateCheckMs,
      })
    ) {
      requestAutomaticDesktopUpdateCheck();
    }
  };
  powerMonitor.on('resume', checkAfterWake);
  powerMonitor.on('unlock-screen', checkAfterWake);
}

/** Restart into a downloaded update only overnight, idle, and with no work at risk. */
const installDownloadedUpdateIfIdle = singleFlight(async () => {
  if (!updateReadyToInstall || nightlyUpdateLaunch) return;
  const workStateSafe = await allWindowWorkStateSafe();
  if (
    shouldInstallDownloadedUpdateWhileRunning({
      updateReadyToInstall,
      localHour: new Date().getHours(),
      systemIdleSeconds: powerMonitor.getSystemIdleTime(),
      audible: anyWindowAudible(),
      hasUnsentInput: false, // Included in the request-time work probe.
      workStateSafe,
    })
  ) {
    autoUpdater.quitAndInstall(true, true);
  }
});

async function installNightlyDownloadedUpdate(): Promise<void> {
  const workStateSafe = await allWindowWorkStateSafe();
  if (
    shouldInstallDownloadedUpdateNow({
      nightlyLaunch: nightlyUpdateLaunch,
      hasVisibleWindow: BrowserWindow.getAllWindows().some(
        win => !win.isDestroyed() && win.isVisible() && !win.isMinimized()
      ),
      workStateSafe,
    })
  ) {
    autoUpdater.quitAndInstall(true, false);
  }
}

function scheduleNightlyUpdateLaunchAgent(): void {
  void installNightlyUpdateLaunchAgent({
    nightlyUpdateLaunch,
    packaged: app.isPackaged,
    platform: process.platform,
    appEnv: APP_ENV,
    execPath: process.execPath,
    homeDirectory: app.getPath('home'),
    uid: process.getuid?.(),
  }).catch(error => {
    console.warn(
      '[jovie-desktop-launch-agent]',
      error instanceof Error ? error.message : String(error)
    );
  });
}

function requestAutomaticWebBuildCheck(): void {
  // The initial call normally sees only the local splash. Preserve that no-op
  // instead of queuing an earlier poll when the composer becomes usable.
  if (!BrowserWindow.getAllWindows().some(isWebBuildReloadWindow)) {
    webBuildReloadPending.clear();
    return;
  }
  const check = () => void checkHudBuildAndReload();
  if (startupMaintenance) startupMaintenance.request('web-build-check', check);
  else check();
}

function scheduleHudBuildAutoReload(): void {
  requestAutomaticWebBuildCheck();

  const interval = setInterval(() => {
    requestAutomaticWebBuildCheck();
  }, HUD_BUILD_INFO_POLL_INTERVAL_MS);

  interval.unref?.();
  powerMonitor.on('resume', () => {
    requestAutomaticWebBuildCheck();
  });
}

function buildUpdateMenuItem(): MenuItemConstructorOptions {
  return {
    ...buildDesktopUpdateMenuItem({
      appEnv: APP_ENV,
      platform: process.platform,
      updateReadyToInstall,
    }),
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
          {
            label: `About ${getDesktopAppDisplayName()}`,
            click: showDesktopAboutWindow,
          },
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
        submenu: [
          {
            label: 'Open in Browser',
            click: () => {
              const url = publicProfilePreviewWindow?.webContents.getURL();
              if (url) void openPublicProfileInBrowser(url);
            },
          },
          { role: 'close', accelerator: 'Command+W' },
        ],
      }
    );
  } else {
    template.unshift({
      label: 'File',
      submenu: [
        {
          label: 'Open in Browser',
          click: () => {
            const url = publicProfilePreviewWindow?.webContents.getURL();
            if (url) void openPublicProfileInBrowser(url);
          },
        },
        {
          label: 'Preferences...',
          accelerator: 'Ctrl+,',
          click: openPreferences,
        },
        {
          label: `About ${getDesktopAppDisplayName()}`,
          click: showDesktopAboutWindow,
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

function sendToAppWindows(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    const parsed = parseUrl(win.webContents.getURL());
    if (parsed?.origin === APP_ORIGIN) {
      win.webContents.send(channel, payload);
    }
  }
}

/** Record the typed updater phase and push it to every trusted app window. */
function emitDesktopUpdatePhase(phase: DesktopUpdatePhase): void {
  desktopUpdatePhase = phase;
  sendToAppWindows(DESKTOP_UPDATE_STATE_CHANNEL, phase);
}

function pushUpdateEvent(event: DesktopUpdateEvent): void {
  emitDesktopUpdatePhase(
    reduceDesktopUpdateState(event, DESKTOP_UPDATE_NOTES_URL)
  );
}

function updateErrorEvent(error: unknown): DesktopUpdateEvent {
  return {
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  };
}

// Wire auto-updater events to renderer IPC so the web UI can show the update
// pill (legacy boolean channels) and the typed update surfaces (JOV-6683).
autoUpdater.on('checking-for-update', () => {
  pushUpdateEvent({ type: 'checking-for-update' });
});

autoUpdater.on('update-available', info => {
  updateReadyToInstall = false;
  pendingManualUpdateCheck = false;
  refreshApplicationMenu();
  sendToAppWindows(UPDATE_AVAILABLE_CHANNEL);
  pushUpdateEvent({
    type: 'update-available',
    version: info.version,
    releaseDate: info.releaseDate ?? null,
  });
});

autoUpdater.on('download-progress', progress => {
  pushUpdateEvent({
    type: 'download-progress',
    percent: progress.percent,
    transferredBytes: progress.transferred,
    totalBytes: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  });
});

autoUpdater.on('update-downloaded', info => {
  updateReadyToInstall = true;
  pendingManualUpdateCheck = false;
  refreshApplicationMenu();
  sendToAppWindows(UPDATE_DOWNLOADED_CHANNEL);
  pushUpdateEvent({ type: 'update-downloaded', version: info.version });

  if (nightlyUpdateLaunch) {
    void installNightlyDownloadedUpdate();
    return;
  }
  void installDownloadedUpdateIfIdle();
});

autoUpdater.on('update-not-available', () => {
  pushUpdateEvent({ type: 'update-not-available' });
  showManualUpdateCheckFeedback('not-available');
  if (nightlyUpdateLaunch) {
    app.quit();
  }
});

autoUpdater.on('error', error => {
  pushUpdateEvent(updateErrorEvent(error));
  showManualUpdateCheckFeedback('error');
  if (nightlyUpdateLaunch) {
    app.quit();
  }
});

// Native visibility stays truthful when backgroundThrottling disables Page Visibility.
ipcMain.handle(GET_VISUAL_ACTIVITY_CHANNEL, (event, ...args: unknown[]) => {
  const frame = event.senderFrame;
  if (
    !trustedVisualActivityRequest({
      args,
      isMainWindow: Boolean(
        mainWindow &&
          !mainWindow.isDestroyed() &&
          event.sender === mainWindow.webContents
      ),
      isCurrentMainFrame: Boolean(
        frame &&
          !frame.detached &&
          frame === event.sender.mainFrame &&
          frame.parent === null
      ),
      senderUrl: frame?.url ?? '',
      appOrigin: APP_ORIGIN,
    })
  )
    return null;
  return visualActivityReaders.get(event.sender.id)?.() ?? null;
});

// Return only the already-validated identity, and only to the trusted app origin.
ipcMain.handle(
  GET_BUILD_IDENTITY_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    return resolveDesktopBuildIdentityIpcRequest({
      trustedSender: isTrustedIpcSender(event),
      args,
      identity: desktopBuildIdentity,
    });
  }
);

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

// Typed update surface (JOV-6683): the renderer's jovieDesktop.updates bridge.
const INVALID_IPC = { ok: false, reason: 'invalid-request' } as const;

ipcMain.handle(DESKTOP_UPDATE_GET_STATE_CHANNEL, event =>
  isTrustedIpcSender(event) ? desktopUpdatePhase : null
);

ipcMain.handle(DESKTOP_UPDATE_CHECK_CHANNEL, event => {
  if (!isTrustedIpcSender(event)) return INVALID_IPC;
  if (!desktopUpdatesSupported()) return { ok: false, reason: 'unsupported' };
  runDesktopUpdateCheck('silent');
  return { ok: true };
});

ipcMain.handle(DESKTOP_UPDATE_DOWNLOAD_CHANNEL, event => {
  if (!isTrustedIpcSender(event)) return INVALID_IPC;
  // autoDownload normally starts the download as soon as an update is found;
  // treat an in-flight or completed download as success and only kick a
  // manual download when the update is still waiting.
  if (
    desktopUpdatePhase.state === 'downloading' ||
    desktopUpdatePhase.state === 'ready'
  ) {
    return { ok: true };
  }
  if (desktopUpdatePhase.state !== 'available') {
    return { ok: false, reason: 'no-update-available' };
  }
  void autoUpdater
    .downloadUpdate()
    .catch(error => pushUpdateEvent(updateErrorEvent(error)));
  return { ok: true };
});

ipcMain.handle(DESKTOP_UPDATE_INSTALL_CHANNEL, event => {
  if (!isTrustedIpcSender(event)) return INVALID_IPC;
  if (!updateReadyToInstall) {
    return { ok: false, reason: 'update-not-downloaded' };
  }
  autoUpdater.quitAndInstall();
  return { ok: true };
});

// Only the live main document may announce a mounted client router.
ipcMain.on(CLIENT_NAVIGATION_READY_CHANNEL, (event, ready: unknown) => {
  if (
    typeof ready !== 'boolean' ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    !event.senderFrame ||
    event.senderFrame.detached ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    event.senderFrame.parent !== null ||
    parseUrl(getIpcSenderUrl(event))?.origin !== APP_ORIGIN
  ) {
    return;
  }
  desktopNavigation.setReady(event.sender.id, ready);
});

// Optional composer evidence does not change the renderer recovery watchdog.
ipcMain.handle(
  DESKTOP_COMPOSER_READINESS_CHANNEL,
  (event, ...args: unknown[]) => {
    return (
      launchReadiness?.composerReady(readinessSender(event), args) ?? false
    );
  }
);

// Hosted app first-paint heartbeat (JOV-3595). Uses send (not invoke) so a
// missing main handler on a stale binary cannot reject the renderer promise.
ipcMain.on(APP_BOOTED_CHANNEL, event => {
  launchReadiness?.reactMounted(readinessSender(event));
  const parsed = parseUrl(getIpcSenderUrl(event));
  if (parsed?.origin !== APP_ORIGIN) return;
  rendererBootControllers.get(event.sender.id)?.markBooted();
  if (process.platform === 'darwin' && !summerRuntimeBridge) {
    summerRuntimeBridge = createSummerRuntimeBridge({
      platform: process.platform,
      appOrigin: APP_ORIGIN,
      homeDirectory: app.getPath('home'),
      workerId: `jovie-desktop-${createHash('sha256')
        .update(app.getPath('userData'))
        .digest('hex')
        .slice(0, 16)}`,
      fetch: event.sender.session.fetch.bind(event.sender.session),
      onReceipt: receipt => {
        console.info('[ovie-summer-bridge]', JSON.stringify(receipt));
      },
    });
    summerRuntimeBridge.start();
  }
});

app.on('before-quit', event => {
  startupMaintenance?.dispose();
  mainLivenessMonitor?.dispose();
  mainLivenessMonitor = null;
  summerRuntimeBridge?.stop();
  summerRuntimeBridge = null;
  if (windowStateQuitFlushed || !windowStateStore.needsFlush()) return;
  windowStateQuitFlushed = true;
  event.preventDefault();
  void windowStateStore
    .flushOnShutdown(WINDOW_STATE_SHUTDOWN_FLUSH_MS)
    .finally(() => {
      app.quit();
    });
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
  OPEN_CURRENT_OVIE_IN_BROWSER_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) =>
    openCurrentOvieInBrowser(
      {
        isMainWindow: event.sender === mainWindow?.webContents,
        isMainFrame:
          event.senderFrame != null &&
          !event.senderFrame.detached &&
          event.senderFrame.parent === null,
        senderUrl: getIpcSenderUrl(event),
        currentUrl: mainWindow?.webContents.getURL() ?? '',
        args,
        options: URL_DISPOSITION_OPTIONS,
      },
      url => shell.openExternal(url)
    )
);

ipcMain.handle(
  OPEN_PUBLIC_PROFILE_IN_BROWSER_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedPublicProfilePreviewSender(event) || args.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }
    return openPublicProfileInBrowser(getIpcSenderUrl(event));
  }
);

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

    const resolution = resolveDesktopBrowserAuthUrl(authUrl);
    if (!resolution.ok) {
      return { ok: false, reason: resolution.reason };
    }

    ensureAuthReturnProtocolRegistered();
    return openExternalUrl(new URL(resolution.authUrl, APP_URL).toString());
  }
);

ipcMain.handle(
  COPY_DESKTOP_AUTH_URL_CHANNEL,
  (
    event: IpcMainInvokeEvent,
    authUrl: unknown,
    ...args: unknown[]
  ): DesktopAuthOpenResult => {
    if (
      !isTrustedDesktopAuthSender(event) ||
      args.length !== 0 ||
      typeof authUrl !== 'string'
    ) {
      return { ok: false, reason: 'invalid-request' };
    }

    const resolution = resolveDesktopBrowserAuthUrl(authUrl);
    if (!resolution.ok) {
      return { ok: false, reason: resolution.reason };
    }

    const externalAuthUrl = new URL(resolution.authUrl, APP_URL).toString();
    try {
      clipboard.writeText(externalAuthUrl);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'clipboard-write-failed' };
    }
  }
);

ipcMain.handle(
  CLOSE_DESKTOP_AUTH_WINDOW_CHANNEL,
  (event: IpcMainInvokeEvent) => {
    if (!isTrustedDesktopAuthSender(event)) {
      return { ok: false, reason: 'invalid-request' };
    }

    clearPendingDesktopAuthFlow();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }

    return { ok: true };
  }
);

ipcMain.handle(
  REDEEM_DESKTOP_AUTH_RETURN_CODE_CHANNEL,
  async (
    event: IpcMainInvokeEvent,
    returnCode: unknown,
    ...args: unknown[]
  ): Promise<DesktopAuthOpenResult> => {
    if (!isTrustedDesktopAuthSender(event) || args.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }

    const pending = desktopBrowserAuthRouteState.pendingPkce;
    const result = await redeemDesktopReturnCode({
      endpoint: new URL(DESKTOP_AUTH_HANDBACK_PATH, APP_URL).toString(),
      // net.fetch follows the system proxy configuration (PAC, corporate
      // proxies). No cookies: the PKCE verifier is the proof.
      fetch: (url, init) => net.fetch(url, { ...init, credentials: 'omit' }),
      pending,
      returnCode,
    });
    if (!result.ok) {
      if (result.reason === 'invalid-code') {
        reportDesktopSecurityEvent('auth-return-code-rejected');
      }
      return { ok: false, reason: result.reason };
    }

    // The user may have cancelled or restarted while the request was out.
    if (desktopBrowserAuthRouteState.pendingPkce !== pending) {
      return { ok: false, reason: 'no-pending-flow' };
    }

    handleAuthCompletion(result.completion);
    return { ok: true };
  }
);

ipcMain.handle(
  GET_DESKTOP_PASSKEY_STATE_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedIpcSender(event) || args.length !== 0) {
      return { available: false, enrolled: false, dismissed: false };
    }
    return { available: desktopPasskeyAvailable, ...readDesktopPasskeyState() };
  }
);

ipcMain.handle(
  SET_DESKTOP_PASSKEY_STATE_CHANNEL,
  async (
    event: IpcMainInvokeEvent,
    update: unknown,
    ...args: unknown[]
  ): Promise<DesktopAuthOpenResult> => {
    const next = applyDesktopPasskeyStateUpdate(update);
    if (!isTrustedIpcSender(event) || args.length !== 0 || !next) {
      return { ok: false, reason: 'invalid-request' };
    }
    return (await writeDesktopPasskeyState(next))
      ? { ok: true }
      : { ok: false, reason: 'state-write-failed' };
  }
);

ipcMain.handle(
  COMPLETE_DESKTOP_PASSKEY_SIGN_IN_CHANNEL,
  (event: IpcMainInvokeEvent, ...args: unknown[]): DesktopAuthOpenResult => {
    if (
      !isTrustedDesktopAuthSender(event) ||
      args.length !== 0 ||
      !desktopPasskeyAvailable
    ) {
      return { ok: false, reason: 'invalid-request' };
    }
    // The passkey sign-in already set the session cookie in this session.
    // Drop the browser flow and open the workspace; /app re-checks auth.
    clearPendingDesktopAuthFlow();
    loadReturnedRoute('/app');
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

function getAuthReturnProtocolClientArgs():
  | readonly [string, readonly string[]]
  | null {
  const defaultAppProcess = process as NodeJS.Process & {
    readonly defaultApp?: boolean;
  };

  if (
    defaultAppProcess.defaultApp &&
    process.argv.length >= 2 &&
    !app.isPackaged
  ) {
    return [process.execPath, [path.resolve(process.argv[1])]];
  }
  return null;
}

function registerAuthReturnProtocol(): void {
  const devArgs = getAuthReturnProtocolClientArgs();
  if (devArgs) {
    app.setAsDefaultProtocolClient(AUTH_RETURN_SCHEME, devArgs[0], [
      ...devArgs[1],
    ]);
    return;
  }

  app.setAsDefaultProtocolClient(AUTH_RETURN_SCHEME);
}

function isAuthReturnProtocolRegistered(): boolean {
  const devArgs = getAuthReturnProtocolClientArgs();
  return devArgs
    ? app.isDefaultProtocolClient(AUTH_RETURN_SCHEME, devArgs[0], [
        ...devArgs[1],
      ])
    : app.isDefaultProtocolClient(AUTH_RETURN_SCHEME);
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
        isAuthReturnDeepLinkCandidate(arg) &&
        !parseDesktopAuthReturnDeepLink(arg)
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

    const profileUrl = argv.find((arg: string) =>
      canonicalPublicProfileUrl(arg)
    );
    if (profileUrl) {
      showPublicProfilePreview(profileUrl);
      return;
    }

    if (hasNightlyUpdateFlag(argv)) {
      runDesktopUpdateCheck('silent');
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

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock && !printBuildIdentityOnStart) return;

  void persistDesktopBuildIdentityEvidence();
  app.setAboutPanelOptions({
    applicationName: getDesktopAppDisplayName(),
    applicationVersion: desktopBuildIdentity.version,
    version:
      desktopBuildIdentity.sourceRevision ?? DESKTOP_BUILD_IDENTITY_UNAVAILABLE,
    credits: formatDesktopBuildIdentityDisplay(desktopBuildIdentity),
  });
  console.info(
    '[jovie-desktop-build-identity]',
    toDesktopBuildIdentityJson(desktopBuildIdentity).trim()
  );

  if (printBuildIdentityOnStart) {
    process.stdout.write(toDesktopBuildIdentityJson(desktopBuildIdentity));
    app.exit(0);
    return;
  }

  await configureDesktopWebAuthn();

  const appIconPath = getAppIconPath();
  if (process.platform === 'darwin' && appIconPath && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  registerAuthReturnProtocol();
  refreshApplicationMenu();

  // RFC 8252 section 7.3 loopback return for browser sign-in. One listener
  // for the app lifetime; a request only binds while a flow is pending, so
  // an idle port completes nothing. If bind fails the deep link and the
  // return code still cover the handback.
  void startDesktopAuthLoopbackServer({
    onComplete: completion => {
      const outcome = handleAuthCompletion(completion);
      // The deep link and the loopback request can deliver the same code; a
      // late duplicate still means the user signed in.
      return outcome === 'completed' || outcome === 'duplicate'
        ? 'completed'
        : 'unmatched';
    },
  }).then(server => {
    authLoopbackPort = server?.port ?? null;
    if (!server) {
      reportDesktopSecurityEvent('auth-loopback-unavailable');
    }
  });

  if (nightlyUpdateLaunch) {
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide();
    }
    configureDesktopAutoUpdater();
    runDesktopUpdateCheck('silent');
    const nightlyTimeout = setTimeout(() => {
      app.quit();
    }, NIGHTLY_UPDATE_TIMEOUT_MS);
    nightlyTimeout.unref?.();
    return;
  }

  // Detection lives on the probe worker's own timers, so this stays correct
  // even while the main loop is blocked — start before any window work.
  startMainLivenessMonitor();

  // The first window paints the boot splash, so the cached wordmark must be
  // resolved before createWindow runs. Start it alongside window-state
  // hydration; the preload never rejects (it falls back to the mark).
  const bootSplashWordmarkReady = preloadDesktopBootSplashWordmark();
  await hydrateWindowState();
  await bootSplashWordmarkReady;

  // macOS menu bar extra (NSStatusItem via Electron Tray)
  if (process.platform === 'darwin') {
    menuBarTray = new MenuBarTray(handleTrayAction);
  }

  startupMaintenance = createStartupMaintenanceGate();
  createWindow(
    pendingAuthCompletion
      ? buildAuthCompletionUrl(pendingAuthCompletion)
      : pendingLegacyAuthReturnRoute
        ? new URL(pendingLegacyAuthReturnRoute, APP_URL).toString()
        : APP_ENTRY_URL
  );
  const directProfileUrl = process.argv.find((arg: string) =>
    canonicalPublicProfileUrl(arg)
  );
  if (directProfileUrl) showPublicProfilePreview(directProfileUrl);
  pendingLegacyAuthReturnRoute = null;
  scheduleNightlyUpdateLaunchAgent();
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

/**
 * A notification click focuses the window, then deep-links via the same URL
 * disposition table the navigation guards use (JOV-6716). Blocked targets
 * degrade to a plain focus; external targets go to the system browser.
 */
function routeDesktopNotificationClick(urlString: string | undefined): void {
  const win =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  showWindow(win);

  if (!urlString) return;
  const action = resolveDesktopNotificationClickAction(
    resolveNavigationUrl(urlString),
    URL_DISPOSITION_OPTIONS
  );
  if (action.kind === 'load-url') {
    navigateInApp(win, action.url);
  } else if (action.kind === 'profile-preview') {
    showPublicProfilePreview(action.url);
  } else if (action.kind === 'open-external') {
    void openExternalUrl(action.url);
  }
}

ipcMain.handle(
  DESKTOP_NOTIFICATION_CHANNEL,
  (event: IpcMainInvokeEvent, payload: unknown, ...rest: unknown[]) => {
    if (!isTrustedIpcSender(event) || rest.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }
    if (!Notification.isSupported()) {
      return { ok: false, reason: 'unsupported' };
    }
    const request = parseDesktopNotificationRequest(payload);
    if (!request) return { ok: false, reason: 'invalid-payload' };

    const notification = new Notification({
      title: request.title,
      body: request.body,
    });
    notification.on('click', () =>
      routeDesktopNotificationClick(request.url)
    );
    notification.show();
    return { ok: true };
  }
);

ipcMain.handle(
  LAUNCH_OPERATOR_CONTROL_CHANNEL,
  async (event: IpcMainInvokeEvent, payload: unknown, ...rest: unknown[]) => {
    if (!isTrustedIpcSender(event) || rest.length !== 0) {
      return { ok: false, reason: 'invalid-request' };
    }
    const request = parseOperatorLaunchRequest(payload);
    if (!request) return { ok: false, reason: 'invalid-payload' };
    const decision = decideOperatorLaunch(request);
    if (!decision.ok) return { ok: false, reason: decision.reason };
    if (decision.action === 'open-external') {
      try {
        await shell.openExternal(decision.url);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'open-external-failed' };
      }
    }
    const spec = terminalLaunchSpec(process.platform, decision.command);
    if (!spec) return { ok: false, reason: 'unsupported-platform' };
    const launched = await runBoundedProcess({
      command: spec.command,
      args: spec.args,
      timeoutMs: OPERATOR_SPAWN_TIMEOUT_MS,
      detached: true,
      stdio: 'ignore',
      waitForExit: false,
    });
    if (!launched.ok) {
      return { ok: false, reason: launched.reason };
    }
    return { ok: true };
  }
);
