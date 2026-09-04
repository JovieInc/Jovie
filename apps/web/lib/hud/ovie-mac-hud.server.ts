import 'server-only';

import { existsSync, readFileSync } from 'node:fs';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { serverFetch } from '@/lib/http/server-fetch';
import {
  composeOvieMacHudInFlightPullRequests,
  composeOvieMacHudSnapshot,
  emptyOvieMacHudInFlightPullRequests,
  monthlyToWeeklyUsd,
  type OvieMacHudInFlightPullRequests,
  type OvieMacHudSnapshot,
  weeklyGrowthFromPeriodRate,
  windowToWeeklyUsd,
} from '@/lib/hud/ovie-mac-hud';
import { WHAT_SHIPPED_STATE_PATH } from '@/lib/hud/what-shipped';

const OVIE_MAC_HUD_IN_FLIGHT_PRS_QUERY = `
query OvieMacHudInFlightPullRequests($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      states: OPEN
      first: 40
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      totalCount
      pageInfo {
        hasNextPage
      }
      nodes {
        ...OvieMacHudPrFields
      }
    }
    mergeQueue(branch: "main") {
      entries(first: 20) {
        pageInfo {
          hasNextPage
        }
        nodes {
          position
          state
          pullRequest {
            ...OvieMacHudPrFields
          }
        }
      }
    }
  }
}

fragment OvieMacHudPrFields on PullRequest {
  number
  title
  url
  headRefName
  updatedAt
  isDraft
  reviewDecision
  mergeable
  author {
    login
  }
  labels(first: 20) {
    nodes {
      name
    }
  }
  reviewRequests(first: 20) {
    totalCount
  }
}
`;

function readShippingEntries(): {
  readonly entries: readonly unknown[];
  readonly available: boolean;
} {
  if (!existsSync(WHAT_SHIPPED_STATE_PATH)) {
    return { entries: [], available: false };
  }
  try {
    const parsed = JSON.parse(readFileSync(WHAT_SHIPPED_STATE_PATH, 'utf8'));
    const record = parsed as { entries?: unknown; items?: unknown };
    const rawEntries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(record.entries)
        ? record.entries
        : Array.isArray(record.items)
          ? record.items
          : [];
    return { entries: rawEntries, available: true };
  } catch (error) {
    captureError('Ovie Mac HUD shipping receipts unreadable', error);
    return { entries: [], available: false };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nodesFromConnection(value: unknown): readonly unknown[] {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return [];
  return value.nodes;
}

function hasNextPage(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.pageInfo)) return false;
  return value.pageInfo.hasNextPage === true;
}

export function parseOvieMacHudInFlightPullRequestsResponse(
  payload: unknown
): OvieMacHudInFlightPullRequests {
  if (!isRecord(payload)) {
    throw new Error('GitHub in-flight PR response was unavailable');
  }

  const data = isRecord(payload.data) ? payload.data : null;
  if (Array.isArray(payload.errors) && payload.errors.length > 0 && !data) {
    throw new Error('GitHub in-flight PR response was unavailable');
  }

  const repository = data && isRecord(data.repository) ? data.repository : null;
  const pullRequests =
    repository && isRecord(repository.pullRequests)
      ? repository.pullRequests
      : null;
  if (
    !repository ||
    !pullRequests ||
    !Number.isInteger(pullRequests.totalCount) ||
    Number(pullRequests.totalCount) < 0 ||
    !Array.isArray(pullRequests.nodes)
  ) {
    throw new Error('GitHub in-flight PR response was malformed');
  }

  const mergeQueue =
    isRecord(repository.mergeQueue) && isRecord(repository.mergeQueue.entries)
      ? repository.mergeQueue.entries
      : null;

  return composeOvieMacHudInFlightPullRequests({
    pullRequests: nodesFromConnection(pullRequests),
    mergeQueueEntries: nodesFromConnection(mergeQueue),
    totalOpen: Number(pullRequests.totalCount),
    sourceTruncated: hasNextPage(pullRequests) || hasNextPage(mergeQueue),
  });
}

export async function getOvieMacHudInFlightPullRequests(): Promise<OvieMacHudInFlightPullRequests> {
  const token = env.HUD_GITHUB_TOKEN;
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;

  if (!token || !owner || !repo) {
    return emptyOvieMacHudInFlightPullRequests(
      'not_configured',
      'GitHub HUD source not configured.'
    );
  }

  try {
    const response = await serverFetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        query: OVIE_MAC_HUD_IN_FLIGHT_PRS_QUERY,
        variables: { owner, name: repo },
      }),
      cache: 'no-store',
      context: 'GitHub in-flight PRs for Ovie Mac HUD',
      retry: {
        maxRetries: 1,
        baseDelayMs: 500,
      },
    });

    if (!response.ok) {
      return emptyOvieMacHudInFlightPullRequests(
        'error',
        `GitHub API error (${response.status})`
      );
    }

    return parseOvieMacHudInFlightPullRequestsResponse(await response.json());
  } catch (error) {
    await captureError('Ovie Mac HUD in-flight PRs failed', error, {
      context: 'ovie_mac_hud_in_flight_prs',
    });
    return emptyOvieMacHudInFlightPullRequests(
      'error',
      error instanceof Error
        ? error.message
        : 'GitHub in-flight PRs unavailable.'
    );
  }
}

export async function getOvieMacHudSnapshot(
  nowMs: number = Date.now()
): Promise<OvieMacHudSnapshot> {
  const generatedAtIso = new Date(nowMs).toISOString();
  const [stripeMetrics, mercuryMetrics, inFlightPullRequests] =
    await Promise.all([
      getAdminStripeOverviewMetrics(),
      getAdminMercuryMetrics(),
      getOvieMacHudInFlightPullRequests(),
    ]);
  const shipping = readShippingEntries();
  const financialAvailable =
    stripeMetrics.isAvailable &&
    mercuryMetrics.isAvailable &&
    mercuryMetrics.burnRateAvailable === true;
  const weeklyRevenueUsd = financialAvailable
    ? monthlyToWeeklyUsd(stripeMetrics.mrrUsd)
    : null;
  const lastWeekRevenueUsd = financialAvailable
    ? monthlyToWeeklyUsd(stripeMetrics.mrrUsd30dAgo)
    : null;
  const monthRate =
    financialAvailable && stripeMetrics.mrrUsd30dAgo > 0
      ? stripeMetrics.mrrUsd / stripeMetrics.mrrUsd30dAgo - 1
      : null;

  return composeOvieMacHudSnapshot({
    alive: {
      cashUsd: financialAvailable ? mercuryMetrics.balanceUsd : null,
      weeklyBurnUsd: financialAvailable
        ? windowToWeeklyUsd(
            mercuryMetrics.burnRateUsd,
            mercuryMetrics.burnWindowDays
          )
        : null,
      weeklyRevenueUsd,
      weeklyRevenueGrowthRate:
        monthRate == null ? null : weeklyGrowthFromPeriodRate(monthRate, 30),
      available: financialAvailable,
    },
    growth: {
      thisWeekRevenueUsd: weeklyRevenueUsd,
      lastWeekRevenueUsd,
      thisWeekActiveUsers: null,
      lastWeekActiveUsers: null,
    },
    shippingEntries: shipping.entries,
    shippingAvailable: shipping.available,
    inFlightPullRequests,
    generatedAtIso,
    nowMs,
  });
}
