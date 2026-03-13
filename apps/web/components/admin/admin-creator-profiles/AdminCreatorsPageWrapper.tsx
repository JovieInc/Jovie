'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { BatchIngestModal } from '@/components/admin/BatchIngestModal';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

export function AdminCreatorsPageWrapper(
  props: Readonly<AdminCreatorProfilesWithSidebarProps>
) {
  const router = useRouter();
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  const handleIngestPending = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleOpenBatchModal = useCallback(() => {
    setBatchModalOpen(true);
  }, []);

  return (
    <>
      <AdminCreatorProfilesUnified
        {...props}
        onOpenBatchModal={handleOpenBatchModal}
        onIngestPending={handleIngestPending}
      />
      <BatchIngestModal
        open={batchModalOpen}
        onOpenChange={setBatchModalOpen}
        onComplete={() => router.refresh()}
      />
    </>
  );
}
