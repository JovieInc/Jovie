'use client';

import { Button } from '@jovie/ui';
import { PanelRight, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';

export interface AdminCreatorsTableHeaderActionsProps {
  /**
   * Callback when an ingestion job is pending.
   * Used to refresh the table after a profile is ingested.
   */
  onIngestPending?: () => void;
}

/**
 * Action buttons displayed in the table header.
 * Includes drawer toggle and page-specific actions like ingest profile.
 */
export function AdminCreatorsTableHeaderActions({
  onIngestPending,
}: Readonly<AdminCreatorsTableHeaderActionsProps>) {
  const { tableMeta } = useTableMeta();
  const [isDrawerOpen, setIsDrawerOpen] = useState(
    () => (tableMeta.rightPanelWidth ?? 0) > 0
  );

  // Track drawer open state based on rightPanelWidth
  useEffect(() => {
    setIsDrawerOpen((tableMeta.rightPanelWidth ?? 0) > 0);
  }, [tableMeta.rightPanelWidth]);

  const DrawerIcon = isDrawerOpen ? PanelRightOpen : PanelRight;

  return (
    <div className='flex items-center gap-1'>
      {/* Page-specific action buttons */}
      <IngestProfileDropdown onIngestPending={onIngestPending} />

      {/* Vertical divider */}
      <div className='h-6 w-px bg-border' aria-hidden='true' />

      {/* Drawer toggle button */}
      <Button
        variant='ghost'
        size='icon'
        onClick={() => tableMeta.toggle?.()}
        aria-label='Toggle contact details'
        className='h-8 w-8 rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
        disabled={!tableMeta.toggle}
      >
        <DrawerIcon className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}
