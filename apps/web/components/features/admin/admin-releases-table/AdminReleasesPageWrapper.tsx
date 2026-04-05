'use client';

import { useEffect, useState } from 'react';
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import { useSearchUrlSync } from '@/hooks/useSearchUrlSync';
import type { AdminReleaseRow, AdminReleasesSort } from '@/lib/admin/types';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

interface AdminReleasesPageWrapperProps {
  readonly releases: AdminReleaseRow[];
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminReleasesSort;
  readonly basePath?: string;
}

export function AdminReleasesPageWrapper(
  props: Readonly<AdminReleasesPageWrapperProps>
) {
  const basePath = props.basePath ?? APP_ROUTES.ADMIN_RELEASES;
  const [searchQuery, setSearchQuery] = useState(props.search);

  // Debounced URL sync (no navigation)
  useSearchUrlSync(searchQuery, basePath);

  const { setHeaderActions } = useSetHeaderActions();

  useEffect(() => {
    setHeaderActions(
      <div className='flex items-center gap-1.5'>
        <HeaderSearchAction
          searchValue={searchQuery}
          onSearchValueChange={setSearchQuery}
          placeholder='Search releases or artists'
          ariaLabel='Search releases or artists'
          submitAriaLabel='Search releases'
          tooltipLabel='Search'
        />

        <div
          className='h-5 w-px bg-(--linear-app-frame-seam)'
          aria-hidden='true'
        />

        <DrawerToggleButton />
      </div>
    );

    return () => {
      setHeaderActions(null);
    };
  }, [setHeaderActions, searchQuery]);

  return (
    <AdminReleasesTableUnified
      releases={props.releases}
      pageSize={props.pageSize}
      total={props.total}
      search={props.search}
      sort={props.sort}
      clientFilter={searchQuery}
    />
  );
}
