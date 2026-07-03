import 'server-only';

import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import type {
  HudGithubRateLimitBucket,
  HudGithubRateLimitsPayload,
} from '@/types/hud-shipper';

function parseHeaderInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function bucketFromHeaders(
  limitHeader: string | null,
  remainingHeader: string | null,
  resetHeader: string | null
): HudGithubRateLimitBucket | null {
  const limit = parseHeaderInt(limitHeader);
  const remaining = parseHeaderInt(remainingHeader);
  const resetEpoch = parseHeaderInt(resetHeader);
  if (limit === null || remaining === null || resetEpoch === null) {
    return null;
  }

  return {
    limit,
    remaining,
    resetAtIso: new Date(resetEpoch * 1000).toISOString(),
  };
}

export async function getHudGithubRateLimits(): Promise<HudGithubRateLimitsPayload> {
  const generatedAtIso = new Date().toISOString();
  const token = env.HUD_GITHUB_TOKEN;
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;

  if (!token || !owner || !repo) {
    return {
      availability: 'not_configured',
      core: null,
      graphql: null,
      generatedAtIso,
    };
  }

  try {
    const coreResponse = await serverFetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
        context: 'HUD GitHub core rate limit',
      }
    );

    const core = bucketFromHeaders(
      coreResponse.headers.get('x-ratelimit-limit'),
      coreResponse.headers.get('x-ratelimit-remaining'),
      coreResponse.headers.get('x-ratelimit-reset')
    );

    const graphqlResponse = await serverFetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        query: `query HudRateLimit { rateLimit { limit remaining resetAt } }`,
      }),
      cache: 'no-store',
      context: 'HUD GitHub GraphQL rate limit',
    });

    let graphql: HudGithubRateLimitBucket | null = null;
    if (graphqlResponse.ok) {
      const body = (await graphqlResponse.json()) as {
        data?: {
          rateLimit?: {
            limit?: number;
            remaining?: number;
            resetAt?: string;
          };
        };
      };
      const rateLimit = body.data?.rateLimit;
      if (
        typeof rateLimit?.limit === 'number' &&
        typeof rateLimit.remaining === 'number' &&
        typeof rateLimit.resetAt === 'string'
      ) {
        graphql = {
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          resetAtIso: rateLimit.resetAt,
        };
      }
    }

    return {
      availability: 'available',
      core,
      graphql,
      generatedAtIso,
    };
  } catch (error) {
    return {
      availability: 'error',
      core: null,
      graphql: null,
      errorMessage:
        error instanceof Error ? error.message : 'Failed to load rate limits',
      generatedAtIso,
    };
  }
}