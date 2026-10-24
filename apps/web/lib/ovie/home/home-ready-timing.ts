import { track } from '@/lib/analytics';
import { recordUxLatency } from '@/lib/monitoring/interaction-latency';

/**
 * Ovie Home first meaningful paint: the time until both the shipping loop and
 * the decisions list have settled (ready or error), so skeletons are gone.
 *
 * Budget is warn-only (2026-10-21 rule: new perf budgets ship warn-only
 * first). An over-budget sample is flagged on the event, never thrown or
 * blocked. Re-evaluate once 7d p95 has samples on staging and production.
 */
export const OVIE_HOME_READY_BUDGET_MS = 2_500;
export const OVIE_HOME_READY_EVENT = 'ovie_home_ready';
export const OVIE_HOME_READY_MEASURE = 'ovie-home:ready';

export type OvieHomeNavigation = 'hard' | 'soft';

export interface OvieHomeReadySample {
  readonly durationMs: number;
  readonly navigation: OvieHomeNavigation;
  readonly budgetMs: number;
  readonly overBudget: boolean;
}

/**
 * Where the measurement starts. A hard load of this URL starts at the
 * document's time origin (0) so server and bundle time count; a client-side
 * navigation starts when Home mounted.
 */
export function ovieHomeStart(input: {
  readonly mountedAt: number;
  readonly firstMountInDocument: boolean;
  readonly documentPath: string | null;
  readonly currentPath: string | null;
}): { readonly startedAt: number; readonly navigation: OvieHomeNavigation } {
  const hard =
    input.firstMountInDocument &&
    input.documentPath !== null &&
    input.documentPath === input.currentPath;
  return hard
    ? { startedAt: 0, navigation: 'hard' }
    : { startedAt: input.mountedAt, navigation: 'soft' };
}

export function ovieHomeReadySample(
  startedAt: number,
  readyAt: number,
  navigation: OvieHomeNavigation
): OvieHomeReadySample {
  const durationMs = Math.max(0, Math.round(readyAt - startedAt));
  return {
    durationMs,
    navigation,
    budgetMs: OVIE_HOME_READY_BUDGET_MS,
    overBudget: durationMs > OVIE_HOME_READY_BUDGET_MS,
  };
}

/**
 * Records one sample in the same sinks the app uses for client latency: the
 * local p50/p95 store (dev toolbar), the analytics event stream, and a
 * Performance API measure for traces. Each sink fails independently.
 */
export function recordOvieHomeReady(sample: OvieHomeReadySample): void {
  recordUxLatency('ovie_home_ready', sample.durationMs);
  track(OVIE_HOME_READY_EVENT, {
    duration_ms: sample.durationMs,
    navigation: sample.navigation,
    budget_ms: sample.budgetMs,
    over_budget: sample.overBudget,
  });
  try {
    globalThis.performance?.measure?.(OVIE_HOME_READY_MEASURE, {
      start: globalThis.performance.now() - sample.durationMs,
      duration: sample.durationMs,
    });
  } catch {
    // The User Timing measure is a trace convenience; the samples above stand.
  }
}
