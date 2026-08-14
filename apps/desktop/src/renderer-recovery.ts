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
}): RendererWatchdogExpiryAction {
  if (input.windowDestroyed || input.booted || input.skipForAuthHandoff) {
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
