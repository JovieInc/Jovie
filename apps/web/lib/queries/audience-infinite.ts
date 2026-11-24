'use client';

import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
} from '@tanstack/react-query';
import type {
  AudienceFilters,
  AudienceView,
} from '@/features/dashboard/organisms/dashboard-audience-table/types';
import type { AudienceMember } from '@/types';
import {
  buildAudienceMembersParams,
  DEFAULT_AUDIENCE_WARM,
} from './audience-members-params';
import { PAGINATED_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

export {
  audienceWarmFilterParams,
  buildAudienceMembersParams,
  DEFAULT_AUDIENCE_WARM,
} from './audience-members-params';

interface AudiencePageResponse {
  rows: AudienceMember[];
  /** Always null — pagination is cursor-based (JOV-1263). */
  total: number | null;
  /** Members only: true when another page exists (JOV-1260, JOV-1263). */
  hasMore?: boolean;
  /** Members only: opaque cursor for the next page fetch (JOV-1263). */
  nextCursor?: string | null;
}

interface UseAudienceInfiniteQueryParams {
  profileId: string;
  view: AudienceView;
  sort: string;
  direction: 'asc' | 'desc';
  filters: AudienceFilters;
  pageSize?: number;
  initialData?: { rows: AudienceMember[]; total: number | null };
}

export function useAudienceInfiniteQuery({
  profileId,
  view,
  sort,
  direction,
  filters,
  pageSize = DEFAULT_AUDIENCE_WARM.pageSize,
  initialData,
}: UseAudienceInfiniteQueryParams) {
  const filterParams = {
    sort,
    direction,
    segments: filters.segments,
  };

  return useInfiniteQuery<
    AudiencePageResponse,
    Error,
    InfiniteData<AudiencePageResponse, string>,
    unknown[],
    string
  >({
    queryKey: [
      ...queryKeys.audience.members(profileId, { ...filterParams, view }),
    ] as unknown[],
    queryFn: async ({ pageParam, signal }) => {
      const params = buildAudienceMembersParams({
        profileId,
        view,
        sort,
        direction,
        pageSize,
        cursor: pageParam === 'first' ? undefined : pageParam,
        segments: filters.segments,
      });

      const res = await fetch(
        `/api/dashboard/audience/members?${params.toString()}`,
        { signal }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch audience: ${res.status}`);
      }
      return res.json() as Promise<AudiencePageResponse>;
    },
    getNextPageParam: lastPage => {
      // Cursor-based: use nextCursor when another page exists (JOV-1263).
      return lastPage.hasMore && lastPage.nextCursor
        ? lastPage.nextCursor
        : undefined;
    },
    initialPageParam: 'first' as string,
    initialData: initialData
      ? {
          pages: [{ rows: initialData.rows, total: initialData.total }],
          pageParams: ['first' as string],
        }
      : undefined,
    placeholderData: keepPreviousData,
    // Audience views already sit behind a query error boundary. Surface API
    // failures immediately instead of spending time in retry/loading limbo.
    throwOnError: true,
    retry: false,
    ...PAGINATED_CACHE,
  });
}
