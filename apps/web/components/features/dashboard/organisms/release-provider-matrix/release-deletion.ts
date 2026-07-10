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
import {
  isDistributedRelease,
  shouldArchiveOnlyRelease,
} from '@/lib/releases/release-archive-policy';

export { isDistributedRelease, shouldArchiveOnlyRelease };

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

    const archiveOnly = shouldArchiveOnlyRelease(deleteTarget);
    setIsDeleting(true);
    try {
      const result = await deleteRelease({ releaseId: deleteTarget.id });
      if (result.success) {
        setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
        toast.success(
          archiveOnly || result.mode === 'archive'
            ? `"${deleteTarget.title}" archived.`
            : `"${deleteTarget.title}" deleted.`
        );
      } else {
        toast.error(
          result.message ??
            (archiveOnly
              ? 'Failed to archive release.'
              : 'Failed to delete release.')
        );
      }
    } catch {
      toast.error(
        archiveOnly ? 'Failed to archive release.' : 'Failed to delete release.'
      );
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
