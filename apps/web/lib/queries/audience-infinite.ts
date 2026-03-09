'use client';

import {
  type InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
} from '@tanstack/react-query';
import type { AudienceFilters } from '@/components/dashboard/organisms/dashboard-audience-table/types';
import type { AudienceMember } from '@/types';
import { PAGINATED_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

interface AudiencePageResponse {
  rows: AudienceMember[];
  /**
   * Members: always null — pagination is cursor-based (JOV-1263).
   * Subscribers: count on page 1 only; null on subsequent pages.
   */
  total: number | null;
  /** Members only: true when another page exists (JOV-1260, JOV-1263). */
  hasMore?: boolean;
  /** Members only: opaque cursor for the next page fetch (JOV-1263). */
  nextCursor?: string | null;
}

/**
 * Opaque page parameter union.
 * Members use a string cursor; subscribers fall back to a numeric page number.
 */
type PageParam = string | number;

interface UseAudienceInfiniteQueryParams {
  profileId: string;
  mode: 'members' | 'subscribers';
  sort: string;
  direction: 'asc' | 'desc';
  filters: AudienceFilters;
  pageSize?: number;
  initialData?: { rows: AudienceMember[]; total: number | null };
}

export function useAudienceInfiniteQuery({
  profileId,
  mode,
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
    queryKey:
      mode === 'members'
        ? ([
            ...queryKeys.audience.members(profileId, filterParams),
          ] as unknown[])
        : ([
            ...queryKeys.audience.subscribers(profileId, filterParams),
          ] as unknown[]),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        pageSize: String(pageSize),
        sort,
        direction,
        profileId,
      });

      if (mode === 'members') {
        // Cursor-based pagination for members (JOV-1263).
        // pageParam is a cursor string on subsequent pages, or the sentinel 'first' on page 1.
        if (typeof pageParam === 'string' && pageParam !== 'first') {
          params.set('cursor', pageParam);
        }
      } else {
        // Page-number pagination for subscribers (unchanged).
        params.set(
          'page',
          String(typeof pageParam === 'number' ? pageParam : 1)
        );
      }

      for (const segment of filters.segments) {
        params.append('segments', segment);
      }

      const res = await fetch(
        `/api/dashboard/audience/${mode}?${params.toString()}`,
        { signal }
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch audience: ${res.status}`);
      }
      return res.json() as Promise<AudiencePageResponse>;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (mode === 'members') {
        // Cursor-based: use nextCursor when another page exists (JOV-1263).
        return lastPage.hasMore && lastPage.nextCursor
          ? lastPage.nextCursor
          : undefined;
      }
      // Subscribers: page-number fallback using total or rows-length heuristic.
      if (lastPage.total !== null && lastPage.total !== undefined) {
        const loaded = allPages.length * pageSize;
        return loaded < lastPage.total ? allPages.length + 1 : undefined;
      }
      return lastPage.rows.length >= pageSize ? allPages.length + 1 : undefined;
    },
    initialPageParam:
      mode === 'members' ? ('first' as PageParam) : (1 as PageParam),
    initialData: initialData
      ? {
          pages: [{ rows: initialData.rows, total: initialData.total }],
          pageParams: [
            mode === 'members' ? ('first' as PageParam) : (1 as PageParam),
          ],
        }
      : undefined,
    placeholderData: keepPreviousData,
    ...PAGINATED_CACHE,
  });
}
