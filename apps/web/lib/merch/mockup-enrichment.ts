import 'server-only';

/**
 * Durable, observable Printful mockup enrichment (JOV-4743).
 *
 * Replaces the untracked fire-and-forget `Promise.allSettled` mockup attach.
 * Guarantees:
 * - Survives the response: the scheduled task RETURNS its promise so
 *   Next.js `after()` can await the enrichment to settlement instead of
 *   serverless teardown cutting it off mid-write (falls back to inline
 *   execution outside a request scope, e.g. tests/scripts).
 * - Retry budget + timeout: each option gets up to MAX_MOCKUP_ATTEMPTS
 *   attempts; per-attempt timeouts are derived from the remaining
 *   MOCKUP_ENRICHMENT_BUDGET_MS so the worker settles inside the hosting
 *   route's function budget. A timed-out attempt is never retried — its
 *   provider work may still be in flight and a retry would overlap it.
 * - Idempotency: an option that already has a truthful Printful mockup is
 *   skipped; URL attachment itself dedupes by URL set membership.
 * - Terminal receipt: every option reaches a terminal state persisted on its
 *   qualityReview evidence (`mockup_ready` | `mockup_failed`) and returned to
 *   the caller for the batch-level production receipt. The queue-tick
 *   reconciler (./generation-recovery) is the fail-safe that fails anything
 *   still pending past the stale window.
 */

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { merchDesignOptions } from '@/lib/db/schema/merch';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { logger } from '@/lib/utils/logger';
import type { MerchMockupStatus } from './generation-contract';
import { isPrintfulMockupUrl } from './mockup-urls';
import {
  attachMockupsToDesignOption,
  generateProductMockups,
  type MockupGenerationRequest,
} from './mockups';

/** Retry budget per option (initial attempt + one retry). */
export const MAX_MOCKUP_ATTEMPTS = 2;
/** Hard ceiling per attempt; the Printful poll loop alone can run ~48s. */
export const MOCKUP_ATTEMPT_TIMEOUT_MS = 90_000;
/**
 * Total enrichment budget per scheduled batch. Anchored to the hosting
 * route's 60s function budget (app/api/chat/route.ts maxDuration) minus
 * headroom, so the worker settles before the host can cut it off and leave
 * options stranded in `pending_mockup`. Per-attempt timeouts are derived
 * from the remaining budget, never the flat ceiling alone.
 */
export const MOCKUP_ENRICHMENT_BUDGET_MS = 45_000;
/** Below this remaining budget an attempt cannot meaningfully start. */
const MIN_ATTEMPT_BUDGET_MS = 5_000;

export interface MerchMockupEnrichmentItem {
  readonly optionId: string;
  readonly request: MockupGenerationRequest;
}

export interface MerchMockupEnrichmentOutcome {
  readonly optionId: string;
  readonly status: Extract<MerchMockupStatus, 'mockup_ready' | 'mockup_failed'>;
  readonly attempts: number;
  readonly error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Marks a withTimeout rejection so retries never overlap in-flight work. */
class MockupAttemptTimeoutError extends Error {}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new MockupAttemptTimeoutError(`${label} timed out after ${ms}ms`)
        ),
      ms
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Merges the terminal mockup state into the option's qualityReview evidence
 * without clobbering the rest of the review payload. Best-effort: a
 * persistence failure is logged, not thrown, so one bad write cannot mask the
 * terminal outcome.
 */
async function persistOptionMockupStatus(
  optionId: string,
  status: MerchMockupStatus,
  error?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    mockupStatus: status,
    mockupCompletedAt: new Date().toISOString(),
    ...(error ? { mockupError: error } : {}),
  };
  try {
    await db
      .update(merchDesignOptions)
      .set({
        qualityReview: drizzleSql`coalesce(${merchDesignOptions.qualityReview}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(merchDesignOptions.id, optionId));
  } catch (persistError) {
    logger.error('[merch-mockups] failed to persist terminal mockup status', {
      optionId,
      status,
      err: errorMessage(persistError),
    });
  }
}

async function enrichOptionMockup(
  item: MerchMockupEnrichmentItem,
  deadlineAt: number
): Promise<MerchMockupEnrichmentOutcome> {
  // Idempotency: never regenerate a truthful mockup that already exists.
  try {
    const [option] = await db
      .select({ mockupUrls: merchDesignOptions.mockupUrls })
      .from(merchDesignOptions)
      .where(eq(merchDesignOptions.id, item.optionId))
      .limit(1);
    if (option?.mockupUrls.some(isPrintfulMockupUrl)) {
      return { optionId: item.optionId, status: 'mockup_ready', attempts: 0 };
    }
  } catch (readError) {
    logger.warn('[merch-mockups] idempotency read failed; continuing', {
      optionId: item.optionId,
      err: errorMessage(readError),
    });
  }

  let lastError = 'Printful mockup generation returned no mockups.';
  let attempt = 0;
  while (attempt < MAX_MOCKUP_ATTEMPTS) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < MIN_ATTEMPT_BUDGET_MS) {
      lastError = `Enrichment budget exhausted before attempt ${attempt + 1} could start.`;
      logger.warn('[merch-mockups] skipping attempt; budget exhausted', {
        optionId: item.optionId,
        attempt: attempt + 1,
        remainingMs,
      });
      break;
    }
    attempt += 1;
    try {
      const { results, errors } = await withTimeout(
        generateProductMockups(item.request),
        Math.min(MOCKUP_ATTEMPT_TIMEOUT_MS, remainingMs),
        `Printful mockup generation (option ${item.optionId}, attempt ${attempt})`
      );
      const mockupUrls = results.flatMap(result => result.mockupUrls);
      if (mockupUrls.length > 0) {
        await attachMockupsToDesignOption(item.optionId, mockupUrls);
        await persistOptionMockupStatus(item.optionId, 'mockup_ready');
        logger.info('[merch-mockups] Printful mockups attached', {
          optionId: item.optionId,
          attempt,
          mockupCount: mockupUrls.length,
        });
        return {
          optionId: item.optionId,
          status: 'mockup_ready',
          attempts: attempt,
        };
      }
      lastError =
        errors.length > 0
          ? errors.join('; ')
          : 'Printful mockup generation returned no mockups.';
      logger.warn('[merch-mockups] mockup attempt failed', {
        optionId: item.optionId,
        attempt,
        maxAttempts: MAX_MOCKUP_ATTEMPTS,
        err: lastError,
      });
    } catch (error) {
      lastError = errorMessage(error);
      logger.warn('[merch-mockups] mockup attempt failed', {
        optionId: item.optionId,
        attempt,
        maxAttempts: MAX_MOCKUP_ATTEMPTS,
        err: lastError,
      });
      if (error instanceof MockupAttemptTimeoutError) {
        // A timed-out attempt leaves provider work in flight; retrying would
        // overlap it. Persist the terminal failure below and let the
        // reconciler backstop anything else.
        break;
      }
    }
  }

  // Terminal failure: user-visible state that blocks publish (JOV-4743).
  await persistOptionMockupStatus(item.optionId, 'mockup_failed', lastError);
  logger.error('[merch-mockups] mockup enrichment reached terminal failure', {
    optionId: item.optionId,
    attempts: attempt,
    err: lastError,
  });
  return {
    optionId: item.optionId,
    status: 'mockup_failed',
    attempts: attempt,
    error: lastError,
  };
}

/** Runs enrichment for all items; never throws — every item gets a terminal outcome. */
export async function runMerchMockupEnrichment(
  items: readonly MerchMockupEnrichmentItem[],
  options?: { readonly budgetMs?: number }
): Promise<readonly MerchMockupEnrichmentOutcome[]> {
  const deadlineAt =
    Date.now() + (options?.budgetMs ?? MOCKUP_ENRICHMENT_BUDGET_MS);
  return Promise.all(items.map(item => enrichOptionMockup(item, deadlineAt)));
}

/**
 * Schedules enrichment so it outlives the response. Inside a request scope the
 * work runs via Next.js `after()`; outside one (tests, scripts) it runs inline
 * so the tracked DB states are still written instead of dropped.
 */
export function scheduleMerchMockupEnrichment(
  items: readonly MerchMockupEnrichmentItem[],
  onSettled?: (
    outcomes: readonly MerchMockupEnrichmentOutcome[]
  ) => void | Promise<void>
): void {
  if (items.length === 0) return;
  const run = async () => {
    const outcomes = await runMerchMockupEnrichment(items);
    await onSettled?.(outcomes);
  };
  // Return the promise so `after()` (and the inline fallback) can await the
  // enrichment to settlement instead of dropping it at teardown.
  const guarded = () =>
    run().catch(error => {
      logger.error('[merch-mockups] enrichment worker crashed', {
        err: errorMessage(error),
      });
    });
  scheduleAfter(guarded, { fallback: 'inline' });
}
