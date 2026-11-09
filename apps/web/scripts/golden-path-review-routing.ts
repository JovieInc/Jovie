/**
 * Routing attribution for the golden-path visual reviewer.
 *
 * reviewWithFailover in ./golden-path-visual-review.ts is Workers AI first
 * (Cloudflare credits) with the Gateway second. That failover is invisible in
 * its result, so a `gateway-over-ceiling` drift finding (Cost Anomaly Gate)
 * cannot say WHY the reviewer landed on the Gateway: a 401 on every sample is
 * a relay-bearer problem (rotate GOLDEN_PATH_REVIEW_WORKERS_AI_TOKEN), while
 * a few 429s under a merge-queue burst are the fallback doing its job.
 * reviewKeyframeTraced returns the per-sample provider and fallback reason;
 * main() aggregates them into verdict.json `reviewers.routing`.
 */
import type { ModelVerdict } from './golden-path-visual-review.ts';
import {
  reviewWithModel,
  WORKERS_AI_REVIEW_BASE_URL,
  WORKERS_AI_REVIEW_MODEL,
} from './golden-path-visual-review.ts';

/** Which provider served a keyframe sample, and why the relay did not. */
export interface TrackedModelReview {
  readonly model: ModelVerdict;
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
 * Reviewer A's failover plus routing attribution. The relay is retried once
 * on a 429: the shared limiter (300 req/min) is exactly what a bursty merge
 * queue produces, and honoring its backoff keeps that volume on Cloudflare
 * credits instead of compounding it onto paid Gateway credits. Any other
 * relay failure falls back to the Gateway immediately, byte-for-byte the
 * review it would have run there.
 */
export async function reviewKeyframeTraced(
  frame: {
    readonly png: Buffer;
    readonly stepId: string;
    readonly path: string;
    readonly expectedArtistName?: string;
    readonly fetchImpl?: typeof fetch;
  },
  keys: {
    readonly gatewayKey: string | undefined;
    readonly gatewayBaseUrl: string;
    readonly workersAiToken: string | undefined;
  },
  retryDelayMs = RELAY_RETRY_DELAY_MS
): Promise<TrackedModelReview> {
  const viaGateway = () =>
    reviewWithModel({
      ...frame,
      apiKey: keys.gatewayKey,
      baseUrl: keys.gatewayBaseUrl,
    });
  if (!keys.workersAiToken) {
    return {
      model: await viaGateway(),
      provider: 'gateway',
      workersAiFallbackReason: 'not configured',
    };
  }
  const viaRelay = () =>
    reviewWithModel({
      ...frame,
      apiKey: keys.workersAiToken,
      baseUrl: WORKERS_AI_REVIEW_BASE_URL,
      model: WORKERS_AI_REVIEW_MODEL,
      provider: 'workers-ai',
    });
  let viaWorkers = await viaRelay();
  if (
    viaWorkers.verdict === 'unknown' &&
    RELAY_RATE_LIMITED.test(viaWorkers.reason)
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
    model: await viaGateway(),
    provider: 'gateway',
    workersAiFallbackReason: viaWorkers.reason,
  };
}
