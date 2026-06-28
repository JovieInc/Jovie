// Decide how to recover when a BrowserWindow's renderer process terminates.
//
// Electron does NOT recover a crashed/killed renderer on its own: the window is
// left blank (a black rectangle) with no path back, which is exactly the
// "Jovie desktop opens to a black screen" failure. The shell must reload the
// renderer on a crash, and — once a small reload budget is exhausted (crash
// loop) — fall back to the visible load-failure page so the user gets a Retry
// affordance instead of staring at black.

export type RendererRecoveryAction = 'ignore' | 'reload' | 'failure-page';

// `render-process-gone` fires for normal teardown too. `clean-exit` is the
// renderer exiting 0 (e.g. the window is closing); it is never a crash and must
// not trigger a reload. Every other reason (crashed, oom, killed,
// abnormal-exit, launch-failed, integrity-failure) is a real loss of the view.
const NON_CRASH_REASONS = new Set(['clean-exit']);

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
