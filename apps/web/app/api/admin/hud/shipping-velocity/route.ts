import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { medianNumber } from '@/lib/hud/number-series';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const RANGE_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '1y': 365,
};

type ValidRange = '7d' | '30d' | '1y';

export interface DailyBucket {
  date: string; // "2026-05-08"
  merged: number;
  opened: number;
  closed: number; // closed without merge
  /** Median hours from PR creation to merge for PRs merged that day (null when no merges). */
  mergeP50Hours?: number | null;
}

export interface ShippingVelocityResponse {
  data: DailyBucket[];
  range: ValidRange;
  cachedAt: string; // ISO
}

interface GitHubPrNode {
  state: string;
  merged: boolean;
  createdAt: string;
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

function buildPrQuery(
  owner: string,
  repo: string,
  cursor: string | null
): string {
  const afterClause = cursor ? `, after: "${cursor}"` : '';
  return `query {
    repository(owner: "${owner}", name: "${repo}") {
      pullRequests(
        states: [MERGED, CLOSED, OPEN]
        first: 100
        orderBy: { field: CREATED_AT, direction: DESC }
        ${afterClause}
      ) {
        nodes { state merged createdAt mergedAt closedAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;
}

async function fetchGraphQLPage(
  token: string,
  query: string
): Promise<GraphQLResponse> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-HUD/1.0',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
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

async function fetchPullRequestsFromGitHub(
  token: string,
  owner: string,
  repo: string,
  sinceIso: string
): Promise<GitHubPrNode[]> {
  const nodes: GitHubPrNode[] = [];
  let cursor: string | null = null;

  for (;;) {
    const query = buildPrQuery(owner, repo, cursor);
    const payload = await fetchGraphQLPage(token, query);

    const prs = payload.data?.repository?.pullRequests;
    if (!prs) break;

    for (const node of prs.nodes) {
      if (node.createdAt < sinceIso) return nodes;
      nodes.push(node);
    }

    if (!prs.pageInfo.hasNextPage) break;
    cursor = prs.pageInfo.endCursor;
  }

  return nodes;
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

function computeBuckets(nodes: GitHubPrNode[], days: number): DailyBucket[] {
  const buckets = buildEmptyBuckets(days);
  const mergeHoursByDate = new Map<string, number[]>();

  for (const node of nodes) {
    incrementBucket(buckets, toDateString(node.createdAt), 'opened');
    countMergedPr(node, buckets, mergeHoursByDate);
    countClosedPr(node, buckets);
  }

  finalizeMergeP50(buckets, mergeHoursByDate);
  return Array.from(buckets.values());
}

function parseRange(request: Request): ValidRange {
  const { searchParams } = new URL(request.url);
  const rawRange = searchParams.get('range') ?? '7d';
  if (rawRange === '30d' || rawRange === '1y') return rawRange;
  return '7d';
}

async function authorizeAdmin(): Promise<Response | null> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }
  return null;
}

async function readCachedVelocity(
  redis: ReturnType<typeof getRedis>,
  cacheKey: string
): Promise<ShippingVelocityResponse | null> {
  if (!redis) return null;
  try {
    return (await redis.get<ShippingVelocityResponse>(cacheKey)) ?? null;
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
    await redis.set(cacheKey, result, { ex: 20 * 60 });
  } catch (redisError) {
    logger.error('[hud/shipping-velocity] Redis set failed', redisError);
  }
}

function emptyVelocityResponse(
  days: number,
  range: ValidRange
): ShippingVelocityResponse {
  return {
    data: Array.from(buildEmptyBuckets(days).values()),
    range,
    cachedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authResponse = await authorizeAdmin();
    if (authResponse) return authResponse;

    const range = parseRange(request);
    const days = RANGE_DAYS[range] ?? 7;

    const redis = getRedis();
    const cacheKey = `hud:shipping-velocity:${range}`;
    const cached = await readCachedVelocity(redis, cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    const token = env.HUD_GITHUB_TOKEN;
    const owner = env.HUD_GITHUB_OWNER;
    const repo = env.HUD_GITHUB_REPO;

    if (!token || !owner || !repo) {
      const emptyResponse = emptyVelocityResponse(days, range);
      return NextResponse.json(emptyResponse, {
        status: 200,
        headers: NO_STORE_HEADERS,
      });
    }

    // Compute "since" date
    const sinceDate = new Date();
    sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
    const sinceIso = sinceDate.toISOString();

    const nodes = await fetchPullRequestsFromGitHub(
      token,
      owner,
      repo,
      sinceIso
    );
    const buckets = computeBuckets(nodes, days);

    const result: ShippingVelocityResponse = {
      data: buckets,
      range,
      cachedAt: new Date().toISOString(),
    };

    await cacheVelocity(redis, cacheKey, result);

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
