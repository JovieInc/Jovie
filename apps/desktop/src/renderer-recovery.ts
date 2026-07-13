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
 * Only arm the boot watchdog for real hosted navigations.
 * Skip data: recovery pages, about:blank, and non-http(s) schemes so the
 * failure shell cannot re-trigger itself and auth blanks don't false-alarm.
 */
export function shouldArmRendererBootWatchdog(url: string): boolean {
  if (!url) return false;
  if (url === 'about:blank') return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('devtools:')) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
