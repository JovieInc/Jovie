// Decide how to recover when a BrowserWindow's renderer process terminates.
//
// Electron does NOT recover a crashed/killed renderer on its own: the window is
// left blank (a black rectangle) with no path back, which is exactly the
// "Jovie desktop opens to a black screen" failure. The shell must reload the
// renderer on a crash, and — once a small reload budget is exhausted (crash
// loop) — fall back to the visible load-failure page so the user gets a Retry
// affordance instead of staring at black.
//
// A second failure mode (JOV-3595): the main-frame load can succeed (HTTP 200)
// while React never hydrates / throws before first paint. Network-level
// `did-fail-load` does not fire, so the shell stays on the near-black
// backgroundColor forever. The boot watchdog covers that path: after a real
// app navigation finishes, the hosted web app must ping `app-booted` within
// RENDERER_BOOT_WATCHDOG_MS or we show the recovery shell.
//
// JOV-5339: that recovery page used to always say "check your connection".
// Classify the real failure, retry transient local compile/restart misses,
// and never clobber a session that already painted because a later HMR ping
// was skipped.

export type RendererRecoveryAction = 'ignore' | 'reload' | 'failure-page';

// `render-process-gone` fires for normal teardown too. `clean-exit` is the
// renderer exiting 0 (e.g. the window is closing); it is never a crash and must
// not trigger a reload. Every other reason (crashed, oom, killed,
// abnormal-exit, launch-failed, integrity-failure) is a real loss of the view.
const NON_CRASH_REASONS = new Set(['clean-exit']);

/** How long to wait after did-finish-load for the renderer app-booted ping. */
export const RENDERER_BOOT_WATCHDOG_MS = 14_000;

/**
 * How long to wait after a main-frame hosted navigation *starts* for the load
 * to finish or fail. JOV-3595 only armed after `did-finish-load`, so a hung
 * or intercepted first navigation (ready-to-show already revealed the near-
 * black backgroundColor) stayed black forever. This deadline covers that gap.
 */
export const RENDERER_LOAD_WATCHDOG_MS = 18_000;

export type RendererWatchdogExpiryAction = 'ignore' | 'failure-page';

export type DesktopLoadFailureKind =
  | 'offline'
  | 'local-server-down'
  | 'host-unreachable'
  | 'timed-out'
  | 'crashed'
  | 'unresponsive'
  | 'http-error'
  | 'unknown';

export type DesktopLoadFailureReason =
  | 'did-fail-load'
  | 'load-watchdog'
  | 'boot-watchdog'
  | 'crashed'
  | 'unresponsive';

export interface DesktopLoadFailureView {
  readonly kind: DesktopLoadFailureKind;
  readonly heading: string;
  readonly body: string;
}

export type HostedLoadRetryAction = 'retry' | 'failure-page';

// Chromium net errors. Only the codes we classify — never treat every
// did-fail-load as "check your connection".
const ERR_NETWORK_CHANGED = -21;
const ERR_CONNECTION_CLOSED = -100;
const ERR_CONNECTION_RESET = -101;
const ERR_CONNECTION_REFUSED = -102;
const ERR_CONNECTION_ABORTED = -103;
const ERR_CONNECTION_FAILED = -104;
const ERR_NAME_NOT_RESOLVED = -105;
const ERR_INTERNET_DISCONNECTED = -106;
const ERR_ADDRESS_UNREACHABLE = -109;
const ERR_CONNECTION_TIMED_OUT = -118;
const ERR_PROXY_CONNECTION_FAILED = -130;
const ERR_NAME_RESOLUTION_FAILED = -137;
const ERR_NETWORK_ACCESS_DENIED = -138;
const ERR_EMPTY_RESPONSE = -324;
const ERR_TIMED_OUT = -7;

const OFFLINE_ERROR_CODES = new Set([
  ERR_NETWORK_CHANGED,
  ERR_INTERNET_DISCONNECTED,
  ERR_NETWORK_ACCESS_DENIED,
]);

const LOCAL_SERVER_DOWN_ERROR_CODES = new Set([
  ERR_CONNECTION_CLOSED,
  ERR_CONNECTION_RESET,
  ERR_CONNECTION_REFUSED,
  ERR_CONNECTION_ABORTED,
  ERR_CONNECTION_FAILED,
  ERR_EMPTY_RESPONSE,
]);

const TIMEOUT_ERROR_CODES = new Set([ERR_TIMED_OUT, ERR_CONNECTION_TIMED_OUT]);

const UNREACHABLE_ERROR_CODES = new Set([
  ERR_NAME_NOT_RESOLVED,
  ERR_ADDRESS_UNREACHABLE,
  ERR_PROXY_CONNECTION_FAILED,
  ERR_NAME_RESOLUTION_FAILED,
]);

export function isLoopbackAppUrl(appUrl: string): boolean {
  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function classifyDesktopLoadFailure(input: {
  readonly reason: DesktopLoadFailureReason;
  readonly errorCode?: number;
  readonly appEnv: 'production' | 'staging' | 'local';
  readonly appUrl: string;
  readonly hostReachable?: boolean;
}): DesktopLoadFailureKind {
  if (input.reason === 'crashed') return 'crashed';
  if (input.reason === 'unresponsive') return 'unresponsive';

  const localHost = input.appEnv === 'local' || isLoopbackAppUrl(input.appUrl);

  if (input.reason === 'load-watchdog' || input.reason === 'boot-watchdog') {
    if (input.hostReachable === true) return 'timed-out';
    return localHost ? 'local-server-down' : 'offline';
  }

  const errorCode = input.errorCode;
  if (typeof errorCode === 'number') {
    if (OFFLINE_ERROR_CODES.has(errorCode)) return 'offline';
    if (TIMEOUT_ERROR_CODES.has(errorCode)) return 'timed-out';
    if (LOCAL_SERVER_DOWN_ERROR_CODES.has(errorCode)) {
      return localHost ? 'local-server-down' : 'host-unreachable';
    }
    if (UNREACHABLE_ERROR_CODES.has(errorCode)) {
      return localHost ? 'local-server-down' : 'host-unreachable';
    }
    if (errorCode === -353) return 'http-error';
  }

  return 'unknown';
}

export function describeDesktopLoadFailure(
  kind: DesktopLoadFailureKind,
  appUrl: string
): DesktopLoadFailureView {
  let host = 'the Jovie host';
  try {
    host = new URL(appUrl).host;
  } catch {
    // Keep the generic host label.
  }

  switch (kind) {
    case 'offline':
      return {
        kind,
        heading: 'Jovie couldn’t load',
        body: 'Check your connection, then try again.',
      };
    case 'local-server-down':
      return {
        kind,
        heading: 'Jovie couldn’t load',
        body: `Local Jovie isn’t running at ${host}.`,
      };
    case 'host-unreachable':
      return {
        kind,
        heading: 'Jovie couldn’t load',
        body: `Couldn’t reach ${host}. Retry, or open Jovie in a browser.`,
      };
    case 'timed-out':
      return {
        kind,
        heading: 'Jovie didn’t finish starting',
        body: 'The host is reachable, but this window didn’t finish loading.',
      };
    case 'crashed':
      return {
        kind,
        heading: 'Jovie crashed',
        body: 'The window closed unexpectedly. Try again.',
      };
    case 'unresponsive':
      return {
        kind,
        heading: 'Jovie stopped responding',
        body: 'The window froze. Try again.',
      };
    case 'http-error':
      return {
        kind,
        heading: 'Jovie couldn’t load',
        body: 'The Jovie host returned an error. Try again.',
      };
    case 'unknown':
      return {
        kind,
        heading: 'Jovie couldn’t load',
        body: 'Something went wrong while loading. Try again.',
      };
  }
}

/**
 * Transient local compile/restart failures should reload the hosted URL
 * instead of immediately painting a false offline screen.
 */
export function decideHostedLoadRetry(input: {
  readonly kind: DesktopLoadFailureKind;
  readonly retryCount: number;
  readonly maxRetries: number;
}): HostedLoadRetryAction {
  if (input.retryCount >= input.maxRetries) return 'failure-page';
  if (
    input.kind === 'local-server-down' ||
    input.kind === 'timed-out' ||
    input.kind === 'host-unreachable' ||
    input.kind === 'unknown'
  ) {
    return 'retry';
  }
  return 'failure-page';
}

export type RendererBootWatchdogAfterLoadAction =
  | 'already-booted'
  | 'arm-boot-watchdog'
  | 'ignore';

export type RendererLoadStartAction = 'arm-load-watchdog' | 'ignore';

export type AbortedMainFrameRecoveryAction =
  | 'ignore'
  | 'canonical-auth-shell'
  | 'arm-load-watchdog';

export function decideRendererRecovery(input: {
  readonly reason: string;
  readonly reloadCount: number;
  readonly maxReloads: number;
}): RendererRecoveryAction {
  if (NON_CRASH_REASONS.has(input.reason)) {
    return 'ignore';
  }

  if (input.reloadCount < input.maxReloads) {
    return 'reload';
  }

  return 'failure-page';
}

/**
 * Only arm the boot watchdog for real hosted navigations on the app origin —
 * the app origin is the only one that ever sends the app-booted ping, so
 * arming for any other http(s) URL is a guaranteed false-positive.
 * Skip data: recovery pages, about:blank, and devtools so the failure shell
 * cannot re-trigger itself and auth blanks don't false-alarm.
 */
export function shouldArmRendererBootWatchdog(
  url: string,
  appOrigin: string
): boolean {
  if (!url) return false;
  if (url === 'about:blank') return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('devtools:')) return false;

  try {
    const parsed = new URL(url);
    return parsed.origin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * React can paint and send app-booted before Chromium emits did-finish-load
 * (for example while a non-blocking resource is still loading). The later
 * load-finished event must preserve that valid heartbeat instead of resetting
 * the renderer to unbooted and scheduling a false failure 14 seconds later.
 */
export function decideRendererBootWatchdogAfterLoad(input: {
  readonly booted: boolean;
  readonly url: string;
  readonly appOrigin: string;
}): RendererBootWatchdogAfterLoadAction {
  if (input.booted) return 'already-booted';
  return shouldArmRendererBootWatchdog(input.url, input.appOrigin)
    ? 'arm-boot-watchdog'
    : 'ignore';
}

/**
 * The main window is hidden while the dedicated desktop auth handoff is open.
 * If its initial auth redirect was intercepted, Electron can leave that hidden
 * renderer at about:blank. Revealing it after cancellation would look like a
 * black app window, so return it to the canonical auth shell instead.
 */
export function shouldRecoverAuthHandoffToCanonicalShell(url: string): boolean {
  return url === '' || url === 'about:blank';
}

/**
 * The main window may sit idle while the dedicated auth handoff is the
 * interactive surface. Only skip its watchdog when that handoff is actually
 * visible — an open-but-unpainted / hidden handoff is the black-window bug.
 */
export function shouldSkipRendererWatchdogForAuthHandoff(input: {
  readonly handoffOpen: boolean;
  readonly handoffVisible: boolean;
}): boolean {
  return input.handoffOpen && input.handoffVisible;
}

export function decideRendererWatchdogExpiry(input: {
  readonly booted: boolean;
  readonly windowDestroyed: boolean;
  readonly skipForAuthHandoff: boolean;
  readonly everBooted?: boolean;
  readonly reason?: 'load' | 'boot';
}): RendererWatchdogExpiryAction {
  if (input.windowDestroyed || input.booted || input.skipForAuthHandoff) {
    return 'ignore';
  }
  // A session that already painted must not be replaced by a false offline
  // page because a later HMR or in-app navigation missed a second ping.
  if (input.reason === 'boot' && input.everBooted) {
    return 'ignore';
  }
  return 'failure-page';
}

/**
 * Arm the load watchdog when a real hosted main-frame navigation starts.
 * Same-document / in-place navigations must not reset a healthy renderer
 * (hash changes would otherwise trip the failure page after a successful boot).
 */
export function decideRendererLoadStart(input: {
  readonly url: string;
  readonly appOrigin: string;
  readonly isMainFrame: boolean;
  readonly isInPlace: boolean;
}): RendererLoadStartAction {
  if (!input.isMainFrame || input.isInPlace) return 'ignore';
  if (!shouldArmRendererBootWatchdog(input.url, input.appOrigin)) {
    return 'ignore';
  }
  return 'arm-load-watchdog';
}

/**
 * An aborted main-frame load (error -3) is normal when we intercept /signin
 * into the dedicated handoff. If nothing recovered and the view is still
 * blank, surface the canonical auth shell instead of leaving black.
 */
export function decideAbortedMainFrameRecovery(input: {
  readonly recoveredViaAuthHandoff: boolean;
  readonly currentUrl: string;
}): AbortedMainFrameRecoveryAction {
  if (input.recoveredViaAuthHandoff) return 'ignore';
  if (shouldRecoverAuthHandoffToCanonicalShell(input.currentUrl)) {
    return 'canonical-auth-shell';
  }
  return 'arm-load-watchdog';
}

/**
 * Electron 25+ emits a single details object; older builds used
 * (event, url, isInPlace, isMainFrame). Accept both so a Chromium bump
 * cannot silently disable the load watchdog.
 */
export function parseDidStartNavigation(args: readonly unknown[]): {
  readonly url: string;
  readonly isMainFrame: boolean;
  readonly isInPlace: boolean;
} | null {
  const first = args[0];
  if (first && typeof first === 'object') {
    const details = first as {
      readonly url?: unknown;
      readonly isMainFrame?: unknown;
      readonly isInPlace?: unknown;
      readonly isSameDocument?: unknown;
    };
    if (typeof details.url === 'string') {
      return {
        url: details.url,
        isMainFrame: details.isMainFrame !== false,
        isInPlace: Boolean(details.isInPlace ?? details.isSameDocument),
      };
    }
  }

  if (typeof args[1] === 'string') {
    return {
      url: args[1],
      isMainFrame: args[3] !== false,
      isInPlace: Boolean(args[2]),
    };
  }

  return null;
}
