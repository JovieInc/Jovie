import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
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
    buckets.set(dateStr, { date: dateStr, merged: 0, opened: 0, closed: 0 });
  }

  return buckets;
}

async function fetchPullRequestsFromGitHub(
  token: string,
  owner: string,
  repo: string,
  sinceIso: string
): Promise<GitHubPrNode[]> {
  const nodes: GitHubPrNode[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        repository(owner: "${owner}", name: "${repo}") {
          pullRequests(
            states: [MERGED, CLOSED, OPEN]
            first: 100
            orderBy: { field: CREATED_AT, direction: DESC }
            ${afterClause}
          ) {
            nodes {
              state
              merged
              createdAt
              mergedAt
              closedAt
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

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

    if (payload.errors && payload.errors.length > 0) {
      throw new Error(
        `GitHub GraphQL errors: ${payload.errors[0]?.message ?? 'unknown'}`
      );
    }

    const prs = payload.data?.repository?.pullRequests;
    if (!prs) {
      break;
    }

    // PRs are ordered newest-first; stop when we go past the since date
    let reachedEnd = false;
    for (const node of prs.nodes) {
      if (node.createdAt < sinceIso) {
        reachedEnd = true;
        break;
      }
      nodes.push(node);
    }

    if (reachedEnd || !prs.pageInfo.hasNextPage) {
      hasNextPage = false;
    } else {
      cursor = prs.pageInfo.endCursor;
      hasNextPage = true;
    }
  }

  return nodes;
}

function computeBuckets(nodes: GitHubPrNode[], days: number): DailyBucket[] {
  const buckets = buildEmptyBuckets(days);

  for (const node of nodes) {
    // Count by createdAt date (opened)
    const openedDate = toDateString(node.createdAt);
    const openedBucket = buckets.get(openedDate);
    if (openedBucket) {
      openedBucket.opened += 1;
    }

    // Count merged PRs by mergedAt date
    if (node.merged && node.mergedAt) {
      const mergedDate = toDateString(node.mergedAt);
      const mergedBucket = buckets.get(mergedDate);
      if (mergedBucket) {
        mergedBucket.merged += 1;
      }
    }

    // Count closed-without-merge PRs by closedAt date
    if (!node.merged && node.state === 'CLOSED' && node.closedAt) {
      const closedDate = toDateString(node.closedAt);
      const closedBucket = buckets.get(closedDate);
      if (closedBucket) {
        closedBucket.closed += 1;
      }
    }
  }

  return Array.from(buckets.values());
}

export async function GET(request: Request): Promise<Response> {
  try {
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

    const { searchParams } = new URL(request.url);
    const rawRange = searchParams.get('range') ?? '7d';
    const range: ValidRange =
      rawRange === '30d' ? '30d' : rawRange === '1y' ? '1y' : '7d';
    const days = RANGE_DAYS[range] ?? 7;

    // Try Redis cache first
    const redis = getRedis();
    const cacheKey = `hud:shipping-velocity:${range}`;

    if (redis) {
      try {
        const cached = await redis.get<ShippingVelocityResponse>(cacheKey);
        if (cached) {
          return NextResponse.json(cached, {
            status: 200,
            headers: NO_STORE_HEADERS,
          });
        }
      } catch (redisError) {
        logger.error('[hud/shipping-velocity] Redis get failed', redisError);
      }
    }

    // Check GitHub token
    const token = env.HUD_GITHUB_TOKEN;
    const owner = env.HUD_GITHUB_OWNER;
    const repo = env.HUD_GITHUB_REPO;

    if (!token || !owner || !repo) {
      const emptyResponse: ShippingVelocityResponse = {
        data: Array.from(buildEmptyBuckets(days).values()),
        range,
        cachedAt: new Date().toISOString(),
      };
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

    // Cache for 20 minutes
    if (redis) {
      try {
        await redis.set(cacheKey, result, { ex: 20 * 60 });
      } catch (redisError) {
        logger.error('[hud/shipping-velocity] Redis set failed', redisError);
      }
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
