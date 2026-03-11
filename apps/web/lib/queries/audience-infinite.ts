'use client';

import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
} from '@tanstack/react-query';
import type {
  AudienceFilters,
  AudienceView,
} from '@/components/dashboard/organisms/dashboard-audience-table/types';
import type { AudienceMember } from '@/types';
import { PAGINATED_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

interface AudiencePageResponse {
  rows: AudienceMember[];
  /** Always null — pagination is cursor-based (JOV-1263). */
  total: number | null;
  /** Members only: true when another page exists (JOV-1260, JOV-1263). */
  hasMore?: boolean;
  /** Members only: opaque cursor for the next page fetch (JOV-1263). */
  nextCursor?: string | null;
}

/** Opaque cursor token for keyset pagination. */
type PageParam = string;

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
  pageSize = 50,
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
    InfiniteData<AudiencePageResponse, PageParam>,
    unknown[],
    PageParam
  >({
    queryKey: [
      ...queryKeys.audience.members(profileId, { ...filterParams, view }),
    ] as unknown[],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        pageSize: String(pageSize),
        sort,
        direction,
        profileId,
      });

      // Cursor-based pagination for members (JOV-1263).
      if (pageParam !== 'first') {
        params.set('cursor', pageParam);
      }

      params.set('view', view);

      for (const segment of filters.segments) {
        params.append('segments', segment);
      }

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
    initialPageParam: 'first' as PageParam,
    initialData: initialData
      ? {
          pages: [{ rows: initialData.rows, total: initialData.total }],
          pageParams: ['first' as PageParam],
        }
      : undefined,
    placeholderData: keepPreviousData,
    ...PAGINATED_CACHE,
  });
}
