'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { PageContent, PageHeader } from '@/components/organisms/PageShell';
import { AdminCreatorProfilesWithSidebar } from './AdminCreatorProfilesWithSidebar';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

export function AdminCreatorsPageWrapper(
  props: AdminCreatorProfilesWithSidebarProps
) {
  const router = useRouter();

  const handleIngestPending = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
      <PageHeader
        title='Creators'
        action={
          <div className='flex items-center gap-1'>
            {/* Page-specific action buttons */}
            <IngestProfileDropdown onIngestPending={handleIngestPending} />

            {/* Vertical divider */}
            <div className='h-6 w-px bg-border' aria-hidden='true' />

            {/* Drawer toggle button */}
            <DrawerToggleButton />
          </div>
        }
      />
      <PageContent noPadding>
        <AdminCreatorProfilesWithSidebar {...props} />
      </PageContent>
    </>
  );
}
