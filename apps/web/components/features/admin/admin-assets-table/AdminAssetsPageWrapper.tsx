'use client';

import { useEffect } from 'react';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import type {
  AdminAssetRow,
  AdminAssetSort,
  AdminAssetType,
} from '@/lib/admin/types';
import { AdminAssetsTable } from './AdminAssetsTable';

interface AdminAssetsPageWrapperProps {
  readonly assets: AdminAssetRow[];
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminAssetSort;
  readonly type: AdminAssetType | 'all';
  readonly issues: 'all' | 'issues';
  readonly verified: 'all' | 'verified' | 'unverified';
}

export function AdminAssetsPageWrapper(
  props: Readonly<AdminAssetsPageWrapperProps>
) {
  const { setHeaderActions } = useSetHeaderActions();

  useEffect(() => {
    setHeaderActions(<DrawerToggleButton />);

    return () => {
      setHeaderActions(null);
    };
  }, [setHeaderActions]);

  return (
    <AdminAssetsTable
      assets={props.assets}
      pageSize={props.pageSize}
      total={props.total}
      search={props.search}
      sort={props.sort}
      type={props.type}
      issues={props.issues}
      verified={props.verified}
    />
  );
}
