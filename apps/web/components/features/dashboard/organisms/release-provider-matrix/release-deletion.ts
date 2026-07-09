'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from 'react';
import { deleteRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { toast } from '@/components/feedback';
import type { ReleaseViewModel } from '@/lib/discography/types';

export function isDistributedRelease(release: ReleaseViewModel): boolean {
  if (!release.primaryIsrc || !release.releaseDate) return false;
  return new Date(release.releaseDate) <= new Date();
}

interface UseReleaseDeletionOptions {
  readonly rows: readonly ReleaseViewModel[];
  readonly setRows: Dispatch<SetStateAction<ReleaseViewModel[]>>;
}

export function useReleaseDeletion({
  rows,
  setRows,
}: UseReleaseDeletionOptions) {
  const [deleteTarget, setDeleteTarget] = useState<ReleaseViewModel | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const requestReleaseDelete = useCallback(
    (releaseId: string) => {
      const release = rows.find(r => r.id === releaseId);
      if (release) {
        setDeleteTarget(release);
      }
    },
    [rows]
  );

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const confirmReleaseDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const result = await deleteRelease({ releaseId: deleteTarget.id });
      if (result.success) {
        setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
        toast.success(`"${deleteTarget.title}" deleted.`);
      } else {
        toast.error(result.message ?? 'Failed to delete release.');
      }
    } catch {
      toast.error('Failed to delete release.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, setRows]);

  return {
    deleteTarget,
    isDeleting,
    requestReleaseDelete,
    closeDeleteDialog,
    confirmReleaseDelete,
  };
}
