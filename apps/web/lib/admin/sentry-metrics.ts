import 'server-only';

import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';

const SENTRY_API_BASE_URL = 'https://sentry.io/api/0';
const CACHE_TTL_MS = 5 * 60 * 1000;
const UNRESOLVED_ERROR_QUERY = 'is:unresolved (level:error OR level:fatal)';

type CachedEntry = {
  expiresAt: number;
  value: AdminSentryMetrics;
};

const sentryMetricsCache = new Map<string, CachedEntry>();

interface SentryIssue {
  level?: string;
  count?: string;
  userCount?: number;
  shortId?: string;
  title?: string;
}

export interface AdminSentryMetrics {
  unresolvedIssues24h: number;
  totalEvents24h: number;
  impactedUsers24h: number;
  criticalIssues24h: number;
  topIssueTitle: string | null;
  topIssueShortId: string | null;
  isConfigured: boolean;
  isAvailable: boolean;
  errorMessage?: string;
}

function buildUnconfiguredResponse(): AdminSentryMetrics {
  return {
    unresolvedIssues24h: 0,
    totalEvents24h: 0,
    impactedUsers24h: 0,
    criticalIssues24h: 0,
    topIssueTitle: null,
    topIssueShortId: null,
    isConfigured: false,
    isAvailable: false,
    errorMessage:
      'Sentry metrics unavailable (requires SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG).',
  };
}

function buildErrorResponse(message: string): AdminSentryMetrics {
  return {
    unresolvedIssues24h: 0,
    totalEvents24h: 0,
    impactedUsers24h: 0,
    criticalIssues24h: 0,
    topIssueTitle: null,
    topIssueShortId: null,
    isConfigured: true,
    isAvailable: false,
    errorMessage: `Sentry API error: ${message}`,
  };
}

function getCacheKey(orgSlug: string): string {
  return `admin:sentry:${orgSlug}`;
}

async function fetchSentryIssues(
  orgSlug: string,
  authToken: string
): Promise<SentryIssue[]> {
  const params = new URLSearchParams({
    query: UNRESOLVED_ERROR_QUERY,
    statsPeriod: '24h',
    sort: 'freq',
    limit: '100',
  });

  const response = await fetch(
    `${SENTRY_API_BASE_URL}/organizations/${orgSlug}/issues/?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      next: {
        revalidate: 300,
      },
    }
  );

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.detail === 'string') detail = ` — ${body.detail}`;
    } catch {
      // response body is not JSON; ignore
    }
    throw new Error(`${response.status} ${response.statusText}${detail}`);
  }

  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as SentryIssue[]) : [];
}

function toNumber(value: string | number | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeMetrics(issues: SentryIssue[]): AdminSentryMetrics {
  const totalEvents24h = issues.reduce(
    (sum, issue) => sum + toNumber(issue.count),
    0
  );
  const impactedUsers24h = issues.reduce(
    (sum, issue) => sum + toNumber(issue.userCount),
    0
  );
  const criticalIssues24h = issues.filter(
    issue => issue.level === 'fatal'
  ).length;
  const topIssue = issues[0];

  return {
    unresolvedIssues24h: issues.length,
    totalEvents24h,
    impactedUsers24h,
    criticalIssues24h,
    topIssueTitle: topIssue?.title ?? null,
    topIssueShortId: topIssue?.shortId ?? null,
    isConfigured: true,
    isAvailable: true,
  };
}

export function clearAdminSentryMetricsCache(): void {
  sentryMetricsCache.clear();
}

export async function getAdminSentryMetrics(): Promise<AdminSentryMetrics> {
  const authToken = env.SENTRY_AUTH_TOKEN;
  const orgSlug = env.SENTRY_ORG_SLUG;

  if (!authToken || !orgSlug) {
    return buildUnconfiguredResponse();
  }

  const cacheKey = getCacheKey(orgSlug);
  const now = Date.now();
  const cached = sentryMetricsCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const issues = await fetchSentryIssues(orgSlug, authToken);
    const metrics = computeMetrics(issues);

    sentryMetricsCache.set(cacheKey, {
      value: metrics,
      expiresAt: now + CACHE_TTL_MS,
    });

    return metrics;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    captureError('Error loading Sentry metrics', error, { message });
    return buildErrorResponse(message);
  }
}
