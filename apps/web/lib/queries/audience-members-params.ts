/**
 * Shared Audience members request builders / defaults.
 *
 * Kept free of `'use client'` so the infinite query hook and API contract
 * tests share one key + URL shape without pulling React Query into
 * server-only callers. Consumers: `audience-infinite.ts` (nav hover does
 * not warm Audience — SSR-only wins ties; see prefetch-dashboard.ts).
 */

import type {
  AudienceFilters,
  AudienceView,
} from '@/features/dashboard/organisms/dashboard-audience-table/types';

/** Defaults that match DashboardAudienceClient + nuqs URL parsers. */
export const DEFAULT_AUDIENCE_WARM = {
  view: 'all' as AudienceView,
  sort: 'lastSeen',
  direction: 'desc' as const,
  segments: [] as AudienceFilters['segments'],
  pageSize: 50,
};

export function audienceWarmFilterParams() {
  return {
    sort: DEFAULT_AUDIENCE_WARM.sort,
    direction: DEFAULT_AUDIENCE_WARM.direction,
    segments: [...DEFAULT_AUDIENCE_WARM.segments],
    view: DEFAULT_AUDIENCE_WARM.view,
  };
}

/**
 * The exact query string the Audience client sends to
 * GET /api/dashboard/audience/members. profileId is REQUIRED by the route
 * (membersQuerySchema); keep this the single builder so the contract test in
 * tests/unit/api/audience/members-request-contract.test.ts covers real requests.
 */
export function buildAudienceMembersParams({
  profileId,
  view,
  sort,
  direction,
  pageSize,
  cursor,
  segments,
}: {
  profileId: string;
  view: AudienceView;
  sort: string;
  direction: 'asc' | 'desc';
  pageSize: number;
  cursor?: string;
  segments: readonly string[];
}): URLSearchParams {
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    sort,
    direction,
    profileId,
  });
  // Cursor-based pagination for members (JOV-1263).
  if (cursor) params.set('cursor', cursor);
  params.set('view', view);
  for (const segment of segments) params.append('segments', segment);
  return params;
}
