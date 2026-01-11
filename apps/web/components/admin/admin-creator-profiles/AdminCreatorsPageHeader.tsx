'use client';

import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { PageHeader } from '@/components/organisms/PageShell';

export interface AdminCreatorsPageHeaderProps {
  onIngestPending?: () => void;
}

export function AdminCreatorsPageHeader({
  onIngestPending,
}: AdminCreatorsPageHeaderProps) {
  return (
    <PageHeader
      title='Creators'
      action={
        <div className='flex items-center gap-1'>
          {/* Page-specific action buttons */}
          <IngestProfileDropdown onIngestPending={onIngestPending} />

          {/* Vertical divider */}
          <div className='h-6 w-px bg-border' aria-hidden='true' />

          {/* Drawer toggle button */}
          <DrawerToggleButton />
        </div>
      }
    />
  );
}
