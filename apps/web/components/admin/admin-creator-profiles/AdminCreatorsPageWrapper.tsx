'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

export function AdminCreatorsPageWrapper(
  props: AdminCreatorProfilesWithSidebarProps
) {
  const router = useRouter();
  const { setHeaderActions } = useHeaderActions();

  const handleIngestPending = useCallback(() => {
    router.refresh();
  }, [router]);

  // Register custom header actions on mount
  useEffect(() => {
    setHeaderActions(
      <div className='flex items-center gap-1'>
        {/* Page-specific action buttons */}
        <IngestProfileDropdown onIngestPending={handleIngestPending} />

        {/* Vertical divider */}
        <div className='h-6 w-px bg-border' aria-hidden='true' />

        {/* Drawer toggle button */}
        <DrawerToggleButton />
      </div>
    );

    // Clear actions on unmount
    return () => {
      setHeaderActions(null);
    };
  }, [setHeaderActions, handleIngestPending]);

  return <AdminCreatorProfilesUnified {...props} />;
}
