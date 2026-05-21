'use client';

import { ListPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { BatchIngestModal } from '@/features/admin/BatchIngestModal';
import { IngestProfileDropdown } from '@/features/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import { cn } from '@/lib/utils';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

function BatchIngestButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        APP_CONTROL_BUTTON_CLASS,
        'h-7 rounded-full px-3 text-[11.5px]'
      )}
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
      <div className='flex items-center gap-1.5'>
        <BatchIngestButton onClick={handleOpenBatchModal} />
        <IngestProfileDropdown onIngestPending={handleIngestPending} />

        <div
          className='h-5 w-px bg-(--linear-app-frame-seam)'
          aria-hidden='true'
        />

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
