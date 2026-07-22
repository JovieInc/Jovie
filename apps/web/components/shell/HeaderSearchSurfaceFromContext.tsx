'use client';

import { QueryClientContext } from '@tanstack/react-query';
import { type ContextType, useContext, useMemo } from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type HeaderSearchAdapter,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { HeaderSearchSurface } from './HeaderSearchSurface';
import type { HeaderSearchCatalog } from './header-search-results';

/** Pulls the global catalogs and route adapter into the single shell surface. */
export function HeaderSearchSurfaceFromContext({
  className,
}: {
  readonly className?: string;
}) {
  const dashboardData = useContext(DashboardDataContext);
  const queryClient = useContext(QueryClientContext);
  const { headerSearchAdapter, isSearchOpen, openSearch, closeSearch } =
    useHeaderActions();

  if (!queryClient) {
    return (
      <HeaderSearchSurface
        adapter={headerSearchAdapter}
        catalog={{
          conversations: [],
          profiles: dashboardData?.creatorProfiles ?? [],
          releases: [],
        }}
        isOpen={isSearchOpen}
        onOpen={openSearch}
        onClose={closeSearch}
        className={className}
      />
    );
  }

  return (
    <HeaderSearchSurfaceWithQueries
      adapter={headerSearchAdapter}
      dashboardData={dashboardData}
      isOpen={isSearchOpen}
      onOpen={openSearch}
      onClose={closeSearch}
      className={className}
    />
  );
}

function HeaderSearchSurfaceWithQueries({
  adapter,
  dashboardData,
  isOpen,
  onOpen,
  onClose,
  className,
}: {
  readonly adapter: HeaderSearchAdapter | null;
  readonly dashboardData: ContextType<typeof DashboardDataContext>;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly className?: string;
}) {
  const profileId = dashboardData?.selectedProfile?.id ?? '';
  const conversationsQuery = useChatConversationsQuery({
    limit: 50,
    enabled: isOpen,
  });
  const releasesQuery = useReleasesQuery(profileId, {
    enabled: isOpen,
  });
  const catalog = useMemo<HeaderSearchCatalog>(
    () => ({
      conversations: conversationsQuery.data ?? [],
      profiles: dashboardData?.creatorProfiles ?? [],
      releases: releasesQuery.data ?? [],
    }),
    [
      conversationsQuery.data,
      dashboardData?.creatorProfiles,
      releasesQuery.data,
    ]
  );

  return (
    <HeaderSearchSurface
      adapter={adapter}
      catalog={catalog}
      isLoading={conversationsQuery.isLoading || releasesQuery.isLoading}
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      className={className}
    />
  );
}
