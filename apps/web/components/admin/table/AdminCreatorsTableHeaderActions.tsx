'use client';

import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';

export interface AdminCreatorsTableHeaderActionsProps {
  /**
   * Callback when an ingestion job is pending.
   * Used to refresh the table after a profile is ingested.
   */
  readonly onIngestPending?: () => void;
}

/**
 * Action buttons displayed in the table header.
 * Includes drawer toggle and page-specific actions like ingest profile.
 */
export function AdminCreatorsTableHeaderActions({
  onIngestPending,
}: Readonly<AdminCreatorsTableHeaderActionsProps>) {
  return (
    <div className='flex items-center gap-1'>
      {/* Page-specific action buttons */}
      <IngestProfileDropdown onIngestPending={onIngestPending} />

      {/* Vertical divider */}
      <div className='h-6 w-px bg-border' aria-hidden='true' />

      {/* Drawer toggle button */}
      <DrawerToggleButton />
    </div>
  );
}
