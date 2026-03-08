'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { AudienceFilters } from '@/components/dashboard/organisms/dashboard-audience-table/types';
import type { AudienceMember } from '@/types';
import { PAGINATED_CACHE } from './cache-strategies';
import { queryKeys } from './keys';

interface AudiencePageResponse {
  rows: AudienceMember[];
  // total is only returned on the first page of subscribers to avoid per-page COUNT overhead.
  // On subsequent pages it is null; use rows.length < pageSize as the "no more pages" signal.
  total: number | null;
}

interface UseAudienceInfiniteQueryParams {
  profileId: string;
  mode: 'members' | 'subscribers';
  sort: string;
  direction: 'asc' | 'desc';
  filters: AudienceFilters;
  pageSize?: number;
  initialData?: { rows: AudienceMember[]; total: number };
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

  return useInfiniteQuery<AudiencePageResponse>({
    queryKey:
      mode === 'members'
        ? queryKeys.audience.members(profileId, filterParams)
        : queryKeys.audience.subscribers(profileId, filterParams),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(pageSize),
        sort,
        direction,
        profileId,
      });

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
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      // When total is available (first page), use it for accurate pagination.
      // On subsequent pages total is null (count skipped for perf); fall back to
      // the rows-length heuristic: a full page means more data likely exists.
      if (lastPage.total !== null) {
        const loaded = allPages.length * pageSize;
        return loaded < lastPage.total ? allPages.length + 1 : undefined;
      }
      return lastPage.rows.length >= pageSize ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    initialData: initialData
      ? {
          pages: [{ rows: initialData.rows, total: initialData.total }],
          pageParams: [1],
        }
      : undefined,
    placeholderData: keepPreviousData,
    ...PAGINATED_CACHE,
  });
}
