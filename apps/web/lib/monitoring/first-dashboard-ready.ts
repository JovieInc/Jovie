import { track } from '@/lib/analytics';
import { recordUxLatency } from '@/lib/monitoring/interaction-latency';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';

/**
 * Time to fully loaded first dashboard (first-dashboard-ready/v1).
 *
 * Starts at the document's time origin (0), the navigation that lands a
 * signed-in user on the app shell, so redirects, server render, streaming,
 * JS and hydration all count. Ends at the first frame where nothing above the
 * fold is still loading: no `[data-slot="skeleton"]`, no `[aria-busy="true"]`
 * and no `*-skeleton` test id intersects the viewport.
 *
 * Measured once per document and only on a hard load of the shell. A client
 * navigation inside the shell is warm by definition and is not this metric.
 *
 * Budget is warn-only (2026-10-21 rule: new perf budgets ship warn-only
 * first). The ratchet lands once the synthetic lane has a baseline.
 */
export const FIRST_DASHBOARD_READY_CONTRACT = 'first-dashboard-ready/v1';
export const FIRST_DASHBOARD_READY_EVENT = 'first_dashboard_ready';
export const FIRST_DASHBOARD_READY_MEASURE = 'jovie:first-dashboard-ready';
export const FIRST_DASHBOARD_READY_ENDPOINT = '/api/dashboard/first-ready';
export const FIRST_DASHBOARD_READY_BUDGET_MS = 2_500;
/** Give up after this long and report the load as timed out. */
export const FIRST_DASHBOARD_READY_TIMEOUT_MS = 30_000;
/** The page must hold the settled state for this many frames in a row. */
export const FIRST_DASHBOARD_READY_STABLE_FRAMES = 2;

export const FIRST_DASHBOARD_LOADING_SELECTOR = [
  '[data-slot="skeleton"]',
  '[aria-busy="true"]',
  '[data-testid$="-skeleton"]',
  '[data-testid="skeleton"]',
].join(',');

export type FirstDashboardReadyOutcome = 'reached' | 'dropped';

export interface FirstDashboardPhases {
  /** Navigation start to first response byte (redirects, auth, server). */
  readonly serverMs: number;
  /** First byte to last byte of the streamed document (Suspense data). */
  readonly documentMs: number;
  /** Document end to hydration of the shell (JS download, parse, hydrate). */
  readonly bootMs: number;
  /** Hydration to settled (client fetches, skeletons, late mounts). */
  readonly settleMs: number;
}

export interface FirstDashboardReadySample extends FirstDashboardPhases {
  readonly contract: typeof FIRST_DASHBOARD_READY_CONTRACT;
  readonly durationMs: number;
  readonly outcome: FirstDashboardReadyOutcome;
  readonly newAccount: boolean;
  readonly budgetMs: number;
  readonly overBudget: boolean;
}

declare global {
  // Read by the synthetic lane (tests/e2e/first-dashboard-ready.spec.ts).
  var __jovieFirstDashboardReady: FirstDashboardReadySample | undefined;
}

interface NavigationTimingLike {
  readonly responseStart: number;
  readonly responseEnd: number;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Split the measured duration into phases. Each boundary is clamped to the
 * previous one, so the phases are never negative and always sum to the total.
 */
export function splitFirstDashboardPhases(input: {
  readonly navigation: NavigationTimingLike | null;
  readonly hydratedAt: number;
  readonly readyAt: number;
}): FirstDashboardPhases {
  const readyAt = nonNegative(input.readyAt);
  const responseStart = Math.min(
    nonNegative(input.navigation?.responseStart ?? 0),
    readyAt
  );
  const responseEnd = Math.min(
    Math.max(nonNegative(input.navigation?.responseEnd ?? 0), responseStart),
    readyAt
  );
  const hydratedAt = Math.min(
    Math.max(nonNegative(input.hydratedAt), responseEnd),
    readyAt
  );
  return {
    serverMs: responseStart,
    documentMs: responseEnd - responseStart,
    bootMs: hydratedAt - responseEnd,
    settleMs: readyAt - hydratedAt,
  };
}

export function buildFirstDashboardReadySample(input: {
  readonly navigation: NavigationTimingLike | null;
  readonly hydratedAt: number;
  readonly readyAt: number;
  readonly outcome: FirstDashboardReadyOutcome;
  readonly newAccount: boolean;
}): FirstDashboardReadySample {
  const phases = splitFirstDashboardPhases(input);
  const durationMs =
    phases.serverMs + phases.documentMs + phases.bootMs + phases.settleMs;
  return {
    contract: FIRST_DASHBOARD_READY_CONTRACT,
    ...phases,
    durationMs,
    outcome: input.outcome,
    newAccount: input.newAccount,
    budgetMs: FIRST_DASHBOARD_READY_BUDGET_MS,
    overBudget:
      input.outcome !== 'reached' ||
      durationMs > FIRST_DASHBOARD_READY_BUDGET_MS,
  };
}

/** True when nothing still loading intersects the viewport. */
export function isAboveTheFoldSettled(
  root: ParentNode,
  viewportHeight: number,
  viewportWidth: number
): boolean {
  const loading = root.querySelectorAll(FIRST_DASHBOARD_LOADING_SELECTOR);
  for (const element of loading) {
    const rect = element.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewportHeight &&
      rect.left < viewportWidth;
    if (visible) return false;
  }
  return true;
}

/** A hard load lands on this document; a soft navigation does not. */
export function isHardShellLoad(input: {
  readonly firstMountInDocument: boolean;
  readonly navigationType: string | null;
}): boolean {
  return (
    input.firstMountInDocument &&
    (input.navigationType === 'navigate' || input.navigationType === null)
  );
}

/**
 * Records one sample in the client latency sinks (local p50/p95 store, the
 * analytics stream, a User Timing measure) and the durable first-party sink
 * Summer reads. Each sink fails independently and none can throw.
 */
export function recordFirstDashboardReady(
  sample: FirstDashboardReadySample
): void {
  globalThis.__jovieFirstDashboardReady = sample;
  if (sample.outcome === 'reached') {
    recordUxLatency('first_dashboard_ready', sample.durationMs);
  }
  try {
    track(FIRST_DASHBOARD_READY_EVENT, {
      duration_ms: sample.durationMs,
      outcome: sample.outcome,
      new_account: sample.newAccount,
      over_budget: sample.overBudget,
    });
  } catch {
    // Analytics never breaks the shell.
  }
  try {
    globalThis.performance?.measure?.(FIRST_DASHBOARD_READY_MEASURE, {
      start: 0,
      duration: sample.durationMs,
    });
  } catch {
    // The User Timing measure is a trace convenience; the samples above stand.
  }
  try {
    postJsonBeacon(FIRST_DASHBOARD_READY_ENDPOINT, {
      durationMs: sample.durationMs,
      serverMs: sample.serverMs,
      documentMs: sample.documentMs,
      bootMs: sample.bootMs,
      settleMs: sample.settleMs,
      outcome: sample.outcome,
      newAccount: sample.newAccount,
    });
  } catch {
    // Fire-and-forget.
  }
}

/**
 * Watch the document until above-the-fold content settles, then record.
 * Returns a cancel function for unmount.
 */
export function watchFirstDashboardReady(input: {
  readonly hydratedAt: number;
  readonly newAccount: boolean;
}): () => void {
  if (globalThis.window === undefined) return () => {};
  const performanceApi = globalThis.performance;
  const navigation =
    (performanceApi?.getEntriesByType?.('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined) ?? null;

  let cancelled = false;
  let frame = 0;
  let stableFrames = 0;
  let settledAt = 0;

  const stop = () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  // rAF stalls in a hidden tab, so a backgrounded load would read as slow.
  // Such a load is not a sample.
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') stop();
  }

  const finish = (outcome: FirstDashboardReadyOutcome, readyAt: number) => {
    stop();
    recordFirstDashboardReady(
      buildFirstDashboardReadySample({
        navigation,
        hydratedAt: input.hydratedAt,
        readyAt,
        outcome,
        newAccount: input.newAccount,
      })
    );
  };

  const tick = () => {
    if (cancelled) return;
    const now = performanceApi.now();
    if (now > FIRST_DASHBOARD_READY_TIMEOUT_MS) {
      finish('dropped', now);
      return;
    }
    const settled = isAboveTheFoldSettled(
      document,
      window.innerHeight,
      window.innerWidth
    );
    if (settled) {
      if (stableFrames === 0) settledAt = now;
      stableFrames += 1;
    } else {
      stableFrames = 0;
    }
    if (stableFrames >= FIRST_DASHBOARD_READY_STABLE_FRAMES) {
      finish('reached', settledAt);
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  if (document.visibilityState === 'hidden') return () => {};
  document.addEventListener('visibilitychange', onVisibilityChange);
  frame = window.requestAnimationFrame(tick);
  return stop;
}
