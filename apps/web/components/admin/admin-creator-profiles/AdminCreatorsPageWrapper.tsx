'use client';

import { ListPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BatchIngestModal } from '@/components/admin/BatchIngestModal';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/components/dashboard/atoms/DashboardHeaderActionGroup';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

export function AdminCreatorsPageWrapper(
  props: Readonly<AdminCreatorProfilesWithSidebarProps>
) {
  const router = useRouter();
  const { setHeaderActions } = useSetHeaderActions();
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  const handleIngestPending = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleOpenBatchModal = useCallback(() => {
    setBatchModalOpen(true);
  }, []);

  // Register custom header actions on mount
  useEffect(() => {
    setHeaderActions(
      <DashboardHeaderActionGroup>
        <DashboardHeaderActionButton
          ariaLabel='Batch ingest creators'
          onClick={handleOpenBatchModal}
          icon={<ListPlus className='h-3.5 w-3.5' />}
          label='Batch Ingest'
          hideLabelOnMobile
        />
        <IngestProfileDropdown
          onIngestPending={handleIngestPending}
          hideLabelOnMobile
        />
        <DrawerToggleButton />
      </DashboardHeaderActionGroup>
    );

    return () => {
      setHeaderActions(null);
    };
  }, [setHeaderActions, handleIngestPending, handleOpenBatchModal]);

  return (
    <>
      <AdminCreatorProfilesUnified {...props} />
      <BatchIngestModal
        open={batchModalOpen}
        onOpenChange={setBatchModalOpen}
        onComplete={() => router.refresh()}
      />
    </>
  );
}
