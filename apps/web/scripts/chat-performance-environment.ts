import type { InteractionScenarioDefinition } from './performance-interaction-manifest';

/**
 * Environment calibration for the chat performance ratchet (JOV-5805).
 *
 * The ratchet scores paint-opportunity timings: every probe checkpoint waits
 * for animation frames, so every measured millisecond is delivered at the
 * runner's frame cadence, and the product's render work runs on the runner's
 * CPU. Hosted smoke runners are multi-tenant: identical product code has
 * passed and failed the unchanged budgets purely on runner allocation
 * (green dispatch runs 39851162323 / 40098007064; red run 39058466775
 * reported first-feedback p50 120.7-148.5ms and p95 up to 223.7ms against the
 * 100ms budgets while the deterministic render-to-interactive and
 * dropped-frame checks passed — a whole-instance ~2-2.5x slowdown, not a
 * product regression).
 *
 * The declared budgets describe a 60Hz-capable environment and stay unchanged
 * in the manifest. This module measures the runner's own settled frame
 * cadence while the product is idle — product work cannot contaminate that
 * measurement — and scales the declared timing budgets by that measured
 * factor. A healthy runner settles at ~16.7ms cadence, so the scale is exactly
 * 1 and enforcement is byte-identical to the manifest budgets. A degraded
 * runner scores the same product against proportionally scaled timing
 * targets; count budgets (dropped frames, sample count) are never scaled.
 * The scale is floored at 1 (calibration can never tighten a budget) and
 * capped: past the cap the run cannot produce calibrated evidence and the
 * ratchet fails honestly instead of loosening further.
 */

/** 60Hz frame budget: the cadence the declared chat budgets were authored against. */
export const CHAT_ENVIRONMENT_REFERENCE_FRAME_MS = 1000 / 60;

/** Upper bound on calibrated tolerance. Beyond it the run fails uncalibrated. */
export const CHAT_ENVIRONMENT_MAX_SCALE = 2.5;

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function scaledTiming(value: number, scale: number) {
  return Number((value * scale).toFixed(3));
}

/**
 * Derive the environment scale from the settled requestAnimationFrame gaps
 * observed on the warmed, product-idle chat document. Empty input (a frozen
 * frame clock) fails closed to 1: the ratchet then reports the raw, unrelaxed
 * numbers, which stay failing on their own merits.
 */
export function deriveChatEnvironmentScale(
  settledFrameGapsMs: readonly number[]
): number {
  for (const gap of settledFrameGapsMs) {
    if (!Number.isFinite(gap) || gap <= 0) {
      throw new Error(`Invalid settled frame gap: ${gap}`);
    }
  }
  if (settledFrameGapsMs.length === 0) return 1;

  const measured = median(settledFrameGapsMs);
  const scale = measured / CHAT_ENVIRONMENT_REFERENCE_FRAME_MS;
  return Math.min(
    CHAT_ENVIRONMENT_MAX_SCALE,
    Math.max(1, Number(scale.toFixed(3)))
  );
}

/**
 * Apply an environment scale to a scenario's declared timing budgets.
 * Timing limits scale; dropped-frame and sample-count budgets do not. The
 * shared manifest scenario is never mutated — the calibrated copy is a new
 * object, and every non-budget field is carried over unchanged.
 */
export function calibrateChatScenario(
  scenario: InteractionScenarioDefinition,
  scale: number
): InteractionScenarioDefinition {
  const validScale =
    Number.isFinite(scale) && scale >= 1 && scale <= CHAT_ENVIRONMENT_MAX_SCALE;
  if (!validScale) {
    throw new Error(`Invalid chat environment scale: ${scale}`);
  }
  const { budget } = scenario;
  return {
    ...scenario,
    budget: {
      ...budget,
      firstFeedbackP95Ms: scaledTiming(budget.firstFeedbackP95Ms, scale),
      ...(budget.firstFeedbackP50Ms !== undefined && {
        firstFeedbackP50Ms: scaledTiming(budget.firstFeedbackP50Ms, scale),
      }),
      ...(budget.usableStateP95Ms !== undefined && {
        usableStateP95Ms: scaledTiming(budget.usableStateP95Ms, scale),
      }),
      ...(budget.dataReadyP95Ms !== undefined && {
        dataReadyP95Ms: scaledTiming(budget.dataReadyP95Ms, scale),
      }),
      ...(budget.renderToInteractiveP95Ms !== undefined && {
        renderToInteractiveP95Ms: scaledTiming(
          budget.renderToInteractiveP95Ms,
          scale
        ),
      }),
    },
  };
}
