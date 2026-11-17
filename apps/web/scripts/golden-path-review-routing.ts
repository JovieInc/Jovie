/**
 * Routing attribution for the golden-path visual reviewer.
 *
 * The reviewer is Workers AI first (Cloudflare credits) with the Gateway
 * second, but the failover is invisible in its result, so a
 * `gateway-over-ceiling` drift finding (Cost Anomaly Gate) cannot say WHY a
 * sample landed on the Gateway: a 401 on every sample is a relay-bearer
 * problem (rotate GOLDEN_PATH_REVIEW_WORKERS_AI_TOKEN), while a few 429s
 * under a merge-queue burst are the fallback doing its job.
 * reviewKeyframeTraced wraps any provider attempt and returns the per-sample
 * provider and fallback reason; the reviewer aggregates them into
 * verdict.json `reviewers.routing`.
 *
 * This module is imported by the reviewer, so it imports nothing back: the
 * provider call is injected, and the verdict is matched structurally.
 */

/** The part of a reviewer verdict the failover logic reads. */
export interface TrackedVerdict {
  readonly verdict: 'pass' | 'blocker' | 'unknown';
  readonly reason?: string;
}

/** Which provider served a keyframe sample, and why the relay did not. */
export interface TrackedModelReview<V = TrackedVerdict> {
  readonly model: V;
  readonly provider: 'workers-ai' | 'gateway';
  /**
   * Set whenever the relay did not serve the sample: 'not configured', or the
   * relay failure reason that triggered the Gateway fallback.
   */
  readonly workersAiFallbackReason?: string;
}

/** The relay answers its own limiter with 429 (retry-after: 10). */
const RELAY_RATE_LIMITED = /workers-ai 429/;
/** One spaced retry keeps a merge-queue burst on Cloudflare credits. */
export const RELAY_RETRY_DELAY_MS = 10_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Attempt the relay first, then the Gateway. The relay is retried once on a
 * 429: the shared limiter (300 req/min) is exactly what a bursty merge queue
 * produces, and honoring its backoff keeps that volume on Cloudflare credits
 * instead of compounding it onto paid Gateway credits. Any other relay
 * failure falls back to the Gateway immediately. `attempt` must return the
 * reviewer's own verdict object (including the `workers-ai <status>` reason
 * it reports for a non-ok relay response).
 */
export async function reviewKeyframeTraced<V extends TrackedVerdict>(
  attempt: (provider: 'workers-ai' | 'gateway') => Promise<V>,
  relayConfigured: boolean,
  retryDelayMs = RELAY_RETRY_DELAY_MS
): Promise<TrackedModelReview<V>> {
  if (!relayConfigured) {
    return {
      model: await attempt('gateway'),
      provider: 'gateway',
      workersAiFallbackReason: 'not configured',
    };
  }
  const viaRelay = () => attempt('workers-ai');
  let viaWorkers = await viaRelay();
  if (
    viaWorkers.verdict === 'unknown' &&
    RELAY_RATE_LIMITED.test(viaWorkers.reason ?? '')
  ) {
    await sleep(retryDelayMs);
    viaWorkers = await viaRelay();
  }
  if (viaWorkers.verdict !== 'unknown')
    return { model: viaWorkers, provider: 'workers-ai' };
  console.log(
    `[golden-path-review] workers-ai unavailable (${viaWorkers.reason}); using the gateway`
  );
  return {
    model: await attempt('gateway'),
    provider: 'gateway',
    workersAiFallbackReason: viaWorkers.reason,
  };
}
