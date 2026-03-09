'use client';

import { ListPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BatchIngestModal } from '@/components/admin/BatchIngestModal';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

function BatchIngestButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-secondary-token hover:bg-accent/10 hover:text-primary-token'
    >
      <ListPlus className='h-3.5 w-3.5' />
      Batch Ingest
    </button>
  );
}

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
      <div className='flex items-center gap-1'>
        <BatchIngestButton onClick={handleOpenBatchModal} />
        <IngestProfileDropdown onIngestPending={handleIngestPending} />

        {/* Vertical divider */}
        <div className='h-6 w-px bg-border' aria-hidden='true' />

        {/* Drawer toggle button */}
        <DrawerToggleButton />
      </div>
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
