'use client';

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { AdminCreatorProfileRow } from './admin-infinite';
import { queryKeys } from './keys';

interface CreatorListPage {
  rows: AdminCreatorProfileRow[];
  total: number;
}

type CreatorListData = InfiniteData<CreatorListPage, number>;

function updateCreatorListData(
  data: CreatorListData | undefined,
  updatePage: (page: CreatorListPage) => CreatorListPage,
  hasChanged: (before: CreatorListPage, after: CreatorListPage) => boolean
): CreatorListData | undefined {
  if (!data) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map(page => {
    const nextPage = updatePage(page);
    if (hasChanged(page, nextPage)) {
      changed = true;
    }
    return nextPage;
  });

  if (!changed) {
    return data;
  }

  return {
    ...data,
    pages,
  };
}

export function patchCachedCreator(
  queryClient: QueryClient,
  profileId: string,
  updater: (profile: AdminCreatorProfileRow) => AdminCreatorProfileRow
) {
  queryClient.setQueriesData<CreatorListData>(
    { queryKey: queryKeys.creators.list() },
    data =>
      updateCreatorListData(
        data,
        page => {
          let pageChanged = false;
          const rows = page.rows.map(profile => {
            if (profile.id !== profileId) {
              return profile;
            }

            const nextProfile = updater(profile);
            if (nextProfile !== profile) {
              pageChanged = true;
            }
            return nextProfile;
          });

          return pageChanged ? { ...page, rows } : page;
        },
        (before, after) => before !== after
      )
  );
}

export function markCachedCreatorsPending(
  queryClient: QueryClient,
  profileIds: string[]
) {
  const profileIdSet = new Set(profileIds);

  queryClient.setQueriesData<CreatorListData>(
    { queryKey: queryKeys.creators.list() },
    data =>
      updateCreatorListData(
        data,
        page => {
          let pageChanged = false;
          const rows = page.rows.map(profile => {
            if (!profileIdSet.has(profile.id)) {
              return profile;
            }

            if (profile.ingestionStatus === 'pending') {
              return profile;
            }

            pageChanged = true;
            return {
              ...profile,
              ingestionStatus: 'pending' as const,
              lastIngestionError: null,
            };
          });

          return pageChanged ? { ...page, rows } : page;
        },
        (before, after) => before !== after
      )
  );
}

export function removeCachedCreator(
  queryClient: QueryClient,
  profileId: string
) {
  queryClient.setQueriesData<CreatorListData>(
    { queryKey: queryKeys.creators.list() },
    data =>
      updateCreatorListData(
        data,
        page => {
          const rows = page.rows.filter(profile => profile.id !== profileId);
          if (rows.length === page.rows.length) {
            return page;
          }

          return {
            ...page,
            rows,
            total: Math.max(0, page.total - 1),
          };
        },
        (before, after) => before !== after
      )
  );
}
