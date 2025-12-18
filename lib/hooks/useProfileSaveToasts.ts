'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import type { SaveStatus } from '@/types';

export interface UseProfileSaveToastsOptions {
  toastId?: string;
}

export function useProfileSaveToasts(
  status: SaveStatus,
  options: UseProfileSaveToastsOptions = {}
): void {
  const toastId = options.toastId ?? 'profile-save-status';

  useEffect(() => {
    if (status.saving) {
      toast.loading('Saving…', { id: toastId });
      return;
    }

    if (status.success) {
      toast.success('Saved', { id: toastId });
      return;
    }

    if (status.error) {
      toast.error(status.error, { id: toastId });
      return;
    }

    toast.dismiss(toastId);
  }, [status.error, status.saving, status.success, toastId]);
}
