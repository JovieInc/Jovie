import 'server-only';

import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import { humanizePrTitle } from '@/lib/hud/humanize-pr-title';
import {
  EMPTY_WHAT_SHIPPED_RESPONSE,
  type WhatShippedItem,
  type WhatShippedResponse,
} from '@/lib/hud/what-shipped';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

/**
 * GitHub-backed fallback source for the /hud "What Shipped" feed.
 *
 * The primary source is `~/.hermes/state/what_shipped.json`, written by the
 * Python sidecar on the dev machine. On deployments where that file does not
 * exist (Vercel, Cloudflare), this module fetches recently merged PRs straight
 * from GitHub and humanizes their titles via `humanizePrTitle` (LLM called at
 * most once per PR, cached in Redis with no expiry).
 */

const MERGED_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 10;
const FEED_CACHE_KEY = 'hud:what-shipped:github-feed:v1';
const FEED_CACHE_TTL_SECONDS = 60;

interface GitHubPullSummary {
  readonly number: number;
  readonly title: string;
  readonly merged_at: string | null;
  readonly html_url: string;
}

function isGitHubPullSummary(value: unknown): value is GitHubPullSummary {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.number === 'number' &&
    typeof record.title === 'string' &&
    typeof record.html_url === 'string' &&
    (typeof record.merged_at === 'string' || record.merged_at === null)
  );
}

async function readCachedFeed(): Promise<WhatShippedResponse | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<WhatShippedResponse>(FEED_CACHE_KEY);
    if (cached && Array.isArray(cached.items)) {
      return cached;
    }
  } catch (error) {
    logger.error('[hud/what-shipped-github] Redis read failed', error);
  }

  return null;
}

async function writeCachedFeed(feed: WhatShippedResponse): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(FEED_CACHE_KEY, feed, { ex: FEED_CACHE_TTL_SECONDS });
  } catch (error) {
    logger.error('[hud/what-shipped-github] Redis write failed', error);
  }
}

async function fetchRecentlyMergedPulls(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubPullSummary[]> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=closed&sort=updated&direction=desc&per_page=50`;

  const response = await serverFetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
    context: 'GitHub merged pulls',
    retry: {
      maxRetries: 2,
      baseDelayMs: 500,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected GitHub API response for merged pulls');
  }

  const cutoff = Date.now() - MERGED_WINDOW_MS;

  return payload
    .filter(isGitHubPullSummary)
    .filter(pull => {
      if (!pull.merged_at) return false;
      const mergedAt = Date.parse(pull.merged_at);
      return Number.isFinite(mergedAt) && mergedAt >= cutoff;
    })
    .sort(
      (a, b) => Date.parse(b.merged_at ?? '') - Date.parse(a.merged_at ?? '')
    )
    .slice(0, MAX_ITEMS);
}

/**
 * Build the What Shipped feed from GitHub with humanized titles.
 *
 * Returns the empty payload when HUD GitHub credentials are not configured or
 * the GitHub call fails — the feed degrades, it never throws to the route.
 */
export async function readWhatShippedFromGitHub(): Promise<WhatShippedResponse> {
  const token = env.HUD_GITHUB_TOKEN;
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;

  if (!token || !owner || !repo) {
    return EMPTY_WHAT_SHIPPED_RESPONSE;
  }

  const cached = await readCachedFeed();
  if (cached) {
    return cached;
  }

  try {
    const pulls = await fetchRecentlyMergedPulls(token, owner, repo);

    const items: WhatShippedItem[] = await Promise.all(
      pulls.map(async (pull): Promise<WhatShippedItem> => {
        const humanized = await humanizePrTitle({
          number: pull.number,
          title: pull.title,
        });

        return {
          number: pull.number,
          title: humanized.title,
          merged_at: pull.merged_at ?? '',
          url: pull.html_url,
        };
      })
    );

    const feed: WhatShippedResponse = {
      generatedAt: new Date().toISOString(),
      items,
      available: true,
    };

    await writeCachedFeed(feed);
    return feed;
  } catch (error) {
    logger.error(
      '[hud/what-shipped-github] Failed to build GitHub feed',
      error
    );
    await captureError('What shipped GitHub fallback failed', error, {
      context: 'hud_what_shipped_github',
    });
    return EMPTY_WHAT_SHIPPED_RESPONSE;
  }
}
