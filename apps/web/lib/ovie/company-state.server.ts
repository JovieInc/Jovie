import 'server-only';

import { createHash } from 'node:crypto';
import { getAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getWaitlistMetrics } from '@/lib/admin/waitlist';
import { getSummerFunnel } from '@/lib/analytics/signup-funnel.server';
import { createLiveFounderWorkReader } from '@/lib/ovie/mcp/founder-work';
import { publishConfiguredShippingState } from '@/lib/ovie/shipping-state/configured.server';
import { getRedis } from '@/lib/redis';
import {
  buildCompanyState,
  COMPANY_STATE_SCHEMA,
  type CompanyStateSnapshot,
  interpretCompanyState,
  summarizeCompanyState,
} from './company-state';
import { type CompanyBlocker, companyBlocker } from './home/company-blocker';

const LATEST_KEY = 'summer:company-state:v1:latest';
const HISTORY_KEY = 'summer:company-state:v1:history';
const CACHE_HITS_KEY = 'summer:company-state:v1:cache-hits';
const CACHE_MISSES_KEY = 'summer:company-state:v1:cache-misses';
const AVOIDED_CALLS_KEY = 'summer:company-state:v1:avoided-upstream-calls';
const HISTORY_LIMIT = 24 * 14;

type RedisStore = NonNullable<ReturnType<typeof getRedis>>;

export interface CompanyStateReadback {
  readonly snapshot: CompanyStateSnapshot;
  readonly answer: ReturnType<typeof summarizeCompanyState> & {
    /** The one revenue blocker Home and Summer's brief both name. */
    readonly blocker: CompanyBlocker | null;
  };
  readonly cache: {
    readonly hit: true;
    readonly hits: number;
    readonly misses: number;
    readonly hitRate: number;
    readonly upstreamCallsAvoided: number;
    readonly readPathUpstreamCalls: 0;
  };
}

function decode(value: unknown): CompanyStateSnapshot | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed &&
      typeof parsed === 'object' &&
      (parsed as { schema?: unknown }).schema === COMPANY_STATE_SCHEMA
      ? (parsed as CompanyStateSnapshot)
      : null;
  } catch {
    return null;
  }
}

async function readCounter(redis: RedisStore, key: string): Promise<number> {
  return Number((await redis.get<number | string>(key)) ?? 0);
}

export async function readCompanyStateCache(
  options: {
    readonly now?: Date;
    readonly track?: boolean;
    readonly redis?: RedisStore | null;
  } = {}
): Promise<CompanyStateReadback | null> {
  const redis = options.redis === undefined ? getRedis() : options.redis;
  if (!redis) return null;
  const stored = decode(await redis.get<unknown>(LATEST_KEY));
  const snapshot =
    stored?.certification && stored.producerHealth
      ? interpretCompanyState(stored, options.now ?? new Date())
      : stored;
  if (!snapshot) {
    if (options.track !== false) await redis.incr(CACHE_MISSES_KEY);
    return null;
  }
  let hits = await readCounter(redis, CACHE_HITS_KEY);
  let misses = await readCounter(redis, CACHE_MISSES_KEY);
  let upstreamCallsAvoided = await readCounter(redis, AVOIDED_CALLS_KEY);
  if (options.track !== false) {
    const avoidedThisRead = snapshot.sync.reduce(
      (total, item) => total + item.calls,
      0
    );
    [hits, misses, upstreamCallsAvoided] = await Promise.all([
      redis.incr(CACHE_HITS_KEY),
      readCounter(redis, CACHE_MISSES_KEY),
      redis.incrby(AVOIDED_CALLS_KEY, avoidedThisRead),
    ]);
  }
  return {
    snapshot,
    answer: {
      ...summarizeCompanyState(snapshot, options.now ?? new Date()),
      blocker: companyBlocker(snapshot, options.now ?? new Date()),
    },
    cache: {
      hit: true,
      hits,
      misses,
      hitRate: hits / Math.max(1, hits + misses),
      upstreamCallsAvoided,
      readPathUpstreamCalls: 0,
    },
  };
}

export async function readCompanyStateHistory(
  limit: number,
  redis: RedisStore | null = getRedis()
): Promise<readonly CompanyStateSnapshot[]> {
  if (!redis) return [];
  const values = await redis.lrange<unknown>(
    HISTORY_KEY,
    0,
    Math.max(0, Math.min(limit, HISTORY_LIMIT) - 1)
  );
  return values
    .map(decode)
    .filter((value): value is CompanyStateSnapshot => value !== null);
}

export async function publishCompanyState(
  snapshot: CompanyStateSnapshot,
  redis: RedisStore | null = getRedis()
): Promise<void> {
  if (!redis) throw new Error('company_state_cache_unavailable');
  const encoded = JSON.stringify(snapshot);
  await redis.set(LATEST_KEY, encoded);
  await redis.lpush(HISTORY_KEY, encoded);
  await redis.ltrim(HISTORY_KEY, 0, HISTORY_LIMIT - 1);
}

export interface CompanyStateProducerDependencies {
  readonly getAcquisitionEligibility: typeof getAcquisitionEligibility;
  readonly getFounderFunnelData: typeof getFounderFunnelData;
  readonly getSummerFunnel: typeof getSummerFunnel;
  readonly getWaitlistMetrics: typeof getWaitlistMetrics;
  readonly getLinearIssues: ReturnType<
    typeof createLiveFounderWorkReader
  >['listLinearIssues'];
  readonly publishShippingState: typeof publishConfiguredShippingState;
  readonly redis: RedisStore | null;
}

const defaultDependencies: CompanyStateProducerDependencies = {
  getAcquisitionEligibility,
  getFounderFunnelData,
  getSummerFunnel,
  getWaitlistMetrics,
  getLinearIssues: createLiveFounderWorkReader().listLinearIssues,
  publishShippingState: publishConfiguredShippingState,
  redis: getRedis(),
};

/** Reads every producer source and builds the snapshot without publishing it. */
async function collectCompanyState(
  now: Date,
  dependencies: CompanyStateProducerDependencies,
  options: { readonly includeExecution?: boolean }
): Promise<CompanyStateSnapshot> {
  const [
    eligibility,
    signupFunnel,
    founderFunnel,
    waitlist,
    previous,
    shipping,
    linearIssues,
  ] = await Promise.all([
    dependencies.getAcquisitionEligibility(),
    dependencies.getSummerFunnel(now),
    dependencies.getFounderFunnelData('7d'),
    dependencies.getWaitlistMetrics(),
    readCompanyStateCache({ redis: dependencies.redis, track: false }),
    options.includeExecution
      ? dependencies.publishShippingState()
      : Promise.resolve(null),
    options.includeExecution
      ? dependencies.getLinearIssues(250, true).catch(() => null)
      : Promise.resolve(null),
  ]);
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        eligibility: eligibility.evaluatedAt,
        funnel: signupFunnel.observedAt,
        execution: [shipping?.sourceRevision, linearIssues],
        waitlist,
      })
    )
    .digest('hex');
  return buildCompanyState({
    now,
    revision,
    acquisitionEligibility: eligibility,
    signupFunnel,
    founderFunnel,
    waitlist,
    shippingProjection: shipping,
    linearIssues,
    linearObservedAt: linearIssues ? now.toISOString() : null,
    previous: previous?.snapshot,
  });
}

export async function refreshCompanyStateCache(
  now = new Date(),
  dependencies: CompanyStateProducerDependencies = defaultDependencies,
  options: { readonly includeExecution?: boolean } = {}
): Promise<CompanyStateSnapshot> {
  const snapshot = await collectCompanyState(now, dependencies, options);
  await publishCompanyState(snapshot, dependencies.redis);
  return snapshot;
}

export interface LiveCompanyBlocker {
  readonly blocker: CompanyBlocker | null;
  readonly generatedAt: string;
  readonly source: 'live';
}

/** How long one live read serves Home before it is taken again. */
export const LIVE_COMPANY_BLOCKER_TTL_MS = 5 * 60_000;
/** A live read that takes longer than this is reported as unavailable. */
export const LIVE_COMPANY_BLOCKER_TIMEOUT_MS = 10_000;

let liveBlockerMemo: {
  readonly at: number;
  readonly value: Promise<LiveCompanyBlocker>;
} | null = null;

/**
 * Home's fallback when no snapshot is cached (a deployment where the producer
 * cron has not published, or Redis is absent). It reads the same sources the
 * cron reads and names the same blocker, but never publishes: the cron stays
 * the only writer. One read is shared per instance for a few minutes so a
 * polling Home does not multiply upstream calls.
 */
export function readLiveCompanyBlocker(
  now = new Date(),
  dependencies: CompanyStateProducerDependencies = defaultDependencies
): Promise<LiveCompanyBlocker> {
  if (
    liveBlockerMemo &&
    now.getTime() - liveBlockerMemo.at < LIVE_COMPANY_BLOCKER_TTL_MS
  ) {
    return liveBlockerMemo.value;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('company_state_live_timeout')),
      LIVE_COMPANY_BLOCKER_TIMEOUT_MS
    );
  });
  const value = Promise.race([
    collectCompanyState(now, dependencies, { includeExecution: false }),
    timeout,
  ])
    .then(snapshot => ({
      blocker: companyBlocker(snapshot, now),
      generatedAt: snapshot.generatedAt,
      source: 'live' as const,
    }))
    .finally(() => clearTimeout(timer));
  const memo = { at: now.getTime(), value };
  liveBlockerMemo = memo;
  value.catch(() => {
    if (liveBlockerMemo === memo) liveBlockerMemo = null;
  });
  return value;
}

/** Test seam: forget the shared live read. */
export function resetLiveCompanyBlockerForTests(): void {
  liveBlockerMemo = null;
}
