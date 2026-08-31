import 'server-only';

import { NextResponse } from 'next/server';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import { medianNumber } from '@/lib/hud/number-series';
import type { HudObservationState } from '@/lib/hud/observation';
import { observationFromShippingVelocityBuckets } from '@/lib/hud/shipping-velocity-observation';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const VELOCITY_CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const VELOCITY_CACHE_STALE_MAX_AGE_MS = 10 * 60 * 1000;
const velocityInFlight = new Map<string, Promise<ShippingVelocityResponse>>();

type ValidRange = '7d' | '30d' | '1y';

const RANGE_DAYS: Record<ValidRange, number> = {
  '7d': 7,
  '30d': 30,
  '1y': 365,
};

const RANGE_FETCH_BUDGETS: Record<
  ValidRange,
  { readonly maxPages: number; readonly timeoutMs: number }
> = {
  '7d': { maxPages: 30, timeoutMs: 20_000 },
  '30d': { maxPages: 75, timeoutMs: 30_000 },
  '1y': { maxPages: 180, timeoutMs: 55_000 },
};

export interface DailyBucket {
  date: string; // "2026-05-08"
  merged: number;
  opened: number;
  closed: number; // closed without merge
  /** Median hours from PR creation to merge for PRs merged that day (null when no merges). */
  mergeP50Hours?: number | null;
}

export type ShippingVelocityObservation = Extract<
  HudObservationState,
  'fresh' | 'stale' | 'empty' | 'not_configured'
>;

export interface ShippingVelocityResponse {
  data: DailyBucket[];
  range: ValidRange;
  cachedAt: string; // ISO
  observation: ShippingVelocityObservation;
  errorMessage?: string | null;
}

interface GitHubPrNode {
  state: string;
  merged: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
}

interface GraphQLResponse {
  data?: {
    repository?: {
      pullRequests?: {
        nodes: GitHubPrNode[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const SHIPPING_VELOCITY_QUERY = `query ShippingVelocity($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      states: [MERGED, CLOSED, OPEN]
      first: 100
      orderBy: { field: UPDATED_AT, direction: DESC }
      after: $cursor
    ) {
      nodes { state merged createdAt updatedAt mergedAt closedAt }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

function toDateString(isoString: string): string {
  return isoString.slice(0, 10);
}

function buildEmptyBuckets(days: number): Map<string, DailyBucket> {
  const buckets = new Map<string, DailyBucket>();
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    buckets.set(dateStr, {
      date: dateStr,
      merged: 0,
      opened: 0,
      closed: 0,
      mergeP50Hours: null,
    });
  }

  return buckets;
}

async function fetchGraphQLPage(
  token: string,
  owner: string,
  repo: string,
  cursor: string | null,
  signal: AbortSignal
): Promise<GraphQLResponse> {
  const response = await serverFetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-HUD/1.0',
    },
    body: JSON.stringify({
      query: SHIPPING_VELOCITY_QUERY,
      variables: { owner, name: repo, cursor },
    }),
    timeoutMs: 15_000,
    context: 'GitHub shipping velocity GraphQL',
    retry: { maxRetries: 1, baseDelayMs: 250 },
    signal,
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API error: ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(
      `GitHub GraphQL errors: ${payload.errors[0]?.message ?? 'unknown'}`
    );
  }

  return payload;
}

function isGitHubPrNode(value: unknown): value is GitHubPrNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  const isTimestamp = (timestamp: unknown): timestamp is string =>
    typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp));
  const state = node.state;
  const mergedAtValid = node.mergedAt === null || isTimestamp(node.mergedAt);
  const closedAtValid = node.closedAt === null || isTimestamp(node.closedAt);
  return (
    (state === 'OPEN' || state === 'CLOSED' || state === 'MERGED') &&
    typeof node.merged === 'boolean' &&
    isTimestamp(node.createdAt) &&
    isTimestamp(node.updatedAt) &&
    mergedAtValid &&
    closedAtValid &&
    (!node.merged || isTimestamp(node.mergedAt)) &&
    (node.merged || state !== 'CLOSED' || isTimestamp(node.closedAt))
  );
}

async function fetchBucketsFromGitHub(
  token: string,
  owner: string,
  repo: string,
  sinceIso: string,
  days: number,
  budget: { readonly maxPages: number; readonly timeoutMs: number }
): Promise<DailyBucket[]> {
  const buckets = buildEmptyBuckets(days);
  const mergeHoursByDate = new Map<string, number[]>();
  const signal = AbortSignal.timeout(budget.timeoutMs);
  const maxNodes = budget.maxPages * 100;
  let cursor: string | null = null;
  let pageCount = 0;
  let nodeCount = 0;

  for (;;) {
    pageCount += 1;
    if (pageCount > budget.maxPages) {
      throw new Error('GitHub GraphQL page budget exceeded');
    }
    const payload = await fetchGraphQLPage(token, owner, repo, cursor, signal);

    const prs = payload.data?.repository?.pullRequests;
    if (
      !prs ||
      !Array.isArray(prs.nodes) ||
      !prs.nodes.every(isGitHubPrNode) ||
      !prs.pageInfo ||
      typeof prs.pageInfo.hasNextPage !== 'boolean' ||
      (typeof prs.pageInfo.endCursor !== 'string' &&
        prs.pageInfo.endCursor !== null)
    ) {
      throw new Error('GitHub GraphQL pull-request shape unavailable');
    }

    for (const node of prs.nodes) {
      if (node.updatedAt < sinceIso) {
        finalizeMergeP50(buckets, mergeHoursByDate);
        return Array.from(buckets.values());
      }
      nodeCount += 1;
      if (nodeCount > maxNodes) {
        throw new Error('GitHub GraphQL node budget exceeded');
      }
      incrementBucket(buckets, toDateString(node.createdAt), 'opened');
      countMergedPr(node, buckets, mergeHoursByDate);
      countClosedPr(node, buckets);
    }

    if (!prs.pageInfo.hasNextPage) break;
    const nextCursor = prs.pageInfo.endCursor;
    if (!nextCursor || nextCursor === cursor) {
      throw new Error('GitHub GraphQL pagination cursor did not advance');
    }
    cursor = nextCursor;
  }

  finalizeMergeP50(buckets, mergeHoursByDate);
  return Array.from(buckets.values());
}

function incrementBucket(
  buckets: Map<string, DailyBucket>,
  date: string,
  field: 'opened' | 'merged' | 'closed'
): void {
  const bucket = buckets.get(date);
  if (!bucket) return;
  bucket[field] += 1;
}

function hoursBetween(startIso: string, endIso: string): number | null {
  const hours =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function appendMergeHours(
  mergeHoursByDate: Map<string, number[]>,
  date: string,
  hoursToMerge: number | null
): void {
  if (hoursToMerge === null) return;
  const hours = mergeHoursByDate.get(date) ?? [];
  hours.push(hoursToMerge);
  mergeHoursByDate.set(date, hours);
}

function countMergedPr(
  node: GitHubPrNode,
  buckets: Map<string, DailyBucket>,
  mergeHoursByDate: Map<string, number[]>
): void {
  if (!node.merged || !node.mergedAt) return;
  const mergedDate = toDateString(node.mergedAt);
  incrementBucket(buckets, mergedDate, 'merged');
  appendMergeHours(
    mergeHoursByDate,
    mergedDate,
    hoursBetween(node.createdAt, node.mergedAt)
  );
}

function countClosedPr(
  node: GitHubPrNode,
  buckets: Map<string, DailyBucket>
): void {
  if (node.merged || node.state !== 'CLOSED' || !node.closedAt) return;
  incrementBucket(buckets, toDateString(node.closedAt), 'closed');
}

function finalizeMergeP50(
  buckets: Map<string, DailyBucket>,
  mergeHoursByDate: Map<string, number[]>
): void {
  for (const [date, hours] of mergeHoursByDate) {
    const bucket = buckets.get(date);
    if (bucket) {
      bucket.mergeP50Hours = medianNumber(hours);
    }
  }
}

function parseRange(request: Request): ValidRange {
  const { searchParams } = new URL(request.url);
  const rawRange = searchParams.get('range') ?? '7d';
  if (rawRange === '30d' || rawRange === '1y') return rawRange;
  return '7d';
}

async function authorizeAdmin(): Promise<Response | null> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  // This GET is a read-only HUD observation. Match authorizeHud(): stale MFA
  // may hide mutations, but it must not make an admin's observation API 403.
  const hasAdminRole =
    entitlements.isAdmin || (await checkAdminRole(entitlements.userId));
  if (!hasAdminRole) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  return null;
}

function normalizeVelocityResponse(
  result: ShippingVelocityResponse
): ShippingVelocityResponse {
  if (result.observation === 'not_configured') {
    return {
      ...result,
      data: [],
      observation: 'not_configured',
      errorMessage:
        result.errorMessage ??
        'GitHub is not configured for shipping velocity.',
    };
  }
  if (result.observation === 'stale') {
    return {
      ...result,
      observation: 'stale',
      errorMessage:
        result.errorMessage ??
        'Refresh unavailable; showing last verified shipping velocity.',
    };
  }
  return {
    ...result,
    observation: observationFromShippingVelocityBuckets(result.data),
    errorMessage: result.errorMessage ?? null,
  };
}

async function readCachedVelocity(
  redis: ReturnType<typeof getRedis>,
  cacheKey: string
): Promise<{
  readonly ageMs: number;
  readonly response: ShippingVelocityResponse;
} | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get<ShippingVelocityResponse>(cacheKey);
    if (!cached) return null;
    const ageMs = Date.now() - Date.parse(cached.cachedAt);
    if (
      !Number.isFinite(ageMs) ||
      ageMs < 0 ||
      ageMs > VELOCITY_CACHE_STALE_MAX_AGE_MS
    ) {
      return null;
    }
    return { ageMs, response: normalizeVelocityResponse(cached) };
  } catch (redisError) {
    logger.error('[hud/shipping-velocity] Redis get failed', redisError);
    return null;
  }
}

async function cacheVelocity(
  redis: ReturnType<typeof getRedis>,
  cacheKey: string,
  result: ShippingVelocityResponse
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(cacheKey, result, {
      ex: Math.ceil(VELOCITY_CACHE_STALE_MAX_AGE_MS / 1000),
    });
  } catch (redisError) {
    logger.error('[hud/shipping-velocity] Redis set failed', redisError);
  }
}

function notConfiguredVelocityResponse(
  range: ValidRange
): ShippingVelocityResponse {
  return {
    data: [],
    range,
    cachedAt: new Date().toISOString(),
    observation: 'not_configured',
    errorMessage: 'GitHub is not configured for shipping velocity.',
  };
}

async function computeVelocity(
  token: string,
  owner: string,
  repo: string,
  range: ValidRange,
  days: number,
  redis: ReturnType<typeof getRedis>,
  cacheKey: string
): Promise<ShippingVelocityResponse> {
  const sinceDate = new Date();
  sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
  const buckets = await fetchBucketsFromGitHub(
    token,
    owner,
    repo,
    sinceDate.toISOString(),
    days,
    RANGE_FETCH_BUDGETS[range]
  );
  const result: ShippingVelocityResponse = {
    data: buckets,
    range,
    cachedAt: new Date().toISOString(),
    observation: observationFromShippingVelocityBuckets(buckets),
  };
  await cacheVelocity(redis, cacheKey, result);
  return result;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authResponse = await authorizeAdmin();
    if (authResponse) return authResponse;

    const range = parseRange(request);
    const days = RANGE_DAYS[range] ?? 7;

    const token = env.HUD_GITHUB_TOKEN;
    const owner = env.HUD_GITHUB_OWNER;
    const repo = env.HUD_GITHUB_REPO;

    if (!token || !owner || !repo) {
      return NextResponse.json(notConfiguredVelocityResponse(range), {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    const redis = getRedis();
    const deploymentEnv = env.VERCEL_ENV ?? env.NODE_ENV ?? 'development';
    const cacheKey = `hud:shipping-velocity:v5:${deploymentEnv}:${range}`;
    const cached = await readCachedVelocity(redis, cacheKey);
    if (
      cached &&
      cached.ageMs <= VELOCITY_CACHE_MAX_AGE_MS &&
      cached.response.observation !== 'not_configured'
    ) {
      return NextResponse.json(cached.response, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    let computation = velocityInFlight.get(cacheKey);
    if (!computation) {
      computation = computeVelocity(
        token,
        owner,
        repo,
        range,
        days,
        redis,
        cacheKey
      );
      velocityInFlight.set(cacheKey, computation);
      const clearComputation = () => {
        if (velocityInFlight.get(cacheKey) === computation) {
          velocityInFlight.delete(cacheKey);
        }
      };
      void computation.then(clearComputation, clearComputation);
    }
    let result: ShippingVelocityResponse;
    try {
      result = await computation;
    } catch (error) {
      if (cached?.response.observation !== undefined) {
        const stale = normalizeVelocityResponse({
          ...cached.response,
          observation: 'stale',
          errorMessage:
            'Refresh unavailable; showing last verified shipping velocity.',
        });
        logger.error(
          '[hud/shipping-velocity] Refresh failed; serving stale cache',
          error
        );
        await captureError('HUD shipping velocity refresh failed', error, {
          route: '/api/admin/hud/shipping-velocity',
          method: 'GET',
          fallback: 'stale-cache',
        });
        return NextResponse.json(stale, {
          status: 200,
          headers: NO_STORE_HEADERS,
        });
      }
      throw error;
    }

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[hud/shipping-velocity] Failed to fetch shipping velocity',
      error
    );
    await captureError('HUD shipping velocity fetch failed', error, {
      route: '/api/admin/hud/shipping-velocity',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch shipping velocity data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
