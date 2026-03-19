'use client';

import { PanelRight, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { IngestProfileDropdown } from '@/features/admin/ingest-profile-dropdown';

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
      <AppIconButton
        onClick={() => tableMeta.toggle?.()}
        aria-label='Toggle contact details'
        className='h-8 w-8 rounded-full bg-transparent text-quaternary-token hover:bg-surface-1 hover:text-secondary-token focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-3.5 [&_svg]:w-3.5'
        disabled={!tableMeta.toggle}
      >
        <DrawerIcon className='h-3.5 w-3.5' />
      </AppIconButton>
    </div>
  );
}
