'use client';

import { useEffect } from 'react';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
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
  const { setHeaderActions } = useSetHeaderActions();

  useEffect(() => {
    setHeaderActions(<DrawerToggleButton />);

    return () => {
      setHeaderActions(null);
    };
  }, [setHeaderActions]);

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
