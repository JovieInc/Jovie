/** Cloudflare-only routing and attribution for the shipping visual reviewer. */
import routingRegistry from '../lib/ai/routing.json';

/** Use the existing routing authority; fail closed if this shipping route drifts. */
const route = routingRegistry.callers.find(
  c => c.id === 'ci.golden-path-review'
);
if (
  route?.route !== 'workers-ai-only' ||
  route.fallback !== null ||
  route.models.length !== 1 ||
  !route.models[0]?.startsWith('@cf/')
) {
  throw new Error('ci.golden-path-review must use only Workers AI');
}
export const WORKERS_AI_REVIEW_MODEL = route.models[0];

export interface TrackedVerdict {
  readonly verdict: 'pass' | 'blocker' | 'unknown';
  readonly reason?: string;
}

interface UnavailableVerdict {
  readonly verdict: 'unknown';
  readonly reason: string;
}

/** Provider attempted; null means no request was made. Unknown is never served. */
export interface TrackedModelReview<V = TrackedVerdict> {
  readonly model: V | UnavailableVerdict;
  readonly provider: 'workers-ai' | null;
}

/** The relay answers its own limiter with 429 (retry-after: 10). */
const RELAY_RATE_LIMITED = /workers-ai 429/;
/** Preserve the existing single spaced retry; never route around the limit. */
export const RELAY_RETRY_DELAY_MS = 10_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Return the relay's verdict, including unknown, after at most one 429 retry. */
export async function reviewKeyframeTraced<V extends TrackedVerdict>(
  attempt: (provider: 'workers-ai') => Promise<V>,
  relayConfigured: boolean,
  retryDelayMs = RELAY_RETRY_DELAY_MS
): Promise<TrackedModelReview<V>> {
  if (!relayConfigured) {
    return {
      model: { verdict: 'unknown', reason: 'workers-ai not configured' },
      provider: null,
    };
  }
  let model = await attempt('workers-ai');
  if (
    model.verdict === 'unknown' &&
    RELAY_RATE_LIMITED.test(model.reason ?? '')
  ) {
    await sleep(retryDelayMs);
    model = await attempt('workers-ai');
  }
  return { model, provider: 'workers-ai' };
}
