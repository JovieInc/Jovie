'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HeaderSearchAction } from '@/components/molecules/HeaderSearchAction';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import type { AdminReleaseRow, AdminReleasesSort } from '@/lib/admin/releases';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

interface AdminReleasesPageWrapperProps {
  readonly releases: AdminReleaseRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminReleasesSort;
  readonly basePath?: string;
}

export function AdminReleasesPageWrapper(
  props: Readonly<AdminReleasesPageWrapperProps>
) {
  const router = useRouter();
  const basePath = props.basePath ?? APP_ROUTES.ADMIN_RELEASES;
  const [searchQuery, setSearchQuery] = useState(props.search);

  const handleSearchApply = useCallback(() => {
    const params = new URLSearchParams();
    params.set('sort', props.sort);
    params.set('pageSize', String(props.pageSize));
    params.set('page', '1');

    const query = searchQuery.trim();
    if (query.length > 0) {
      params.set('q', query);
    }

    const queryString = params.toString();
    router.push(queryString ? `${basePath}?${queryString}` : basePath);
  }, [basePath, props.pageSize, props.sort, router, searchQuery]);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    if (props.search) {
      router.push(basePath);
    }
  }, [basePath, props.search, router]);

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
          onApply={handleSearchApply}
          onClearAction={handleSearchClear}
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
  }, [setHeaderActions, handleSearchApply, handleSearchClear, searchQuery]);

  return (
    <AdminReleasesTableUnified
      releases={props.releases}
      pageSize={props.pageSize}
      total={props.total}
      search={props.search}
      sort={props.sort}
    />
  );
}
