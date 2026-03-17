'use client';

import { useCallback, useState } from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { PendingPreview } from './types';

interface UsePendingPreviewProps {
  readonly onAdd: (link: DetectedLink) => Promise<void> | void;
}

export function usePendingPreview({ onAdd }: UsePendingPreviewProps) {
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(
    null
  );
  const [clearSignal, setClearSignal] = useState(0);

  const handleAddPendingPreview = useCallback(
    (link: DetectedLink) => {
      void onAdd(link);
      setPendingPreview(null);
      setClearSignal(c => c + 1);
    },
    [onAdd]
  );

  const handleCancelPendingPreview = useCallback(() => {
    setPendingPreview(null);
    setClearSignal(c => c + 1);
  }, []);

  const handlePreviewChange = useCallback(
    (link: DetectedLink | null, isDuplicate: boolean) => {
      if (!link || isDuplicate) {
        setPendingPreview(null);
        return;
      }
      setPendingPreview({ link, isDuplicate });
    },
    []
  );

  return {
    pendingPreview,
    clearSignal,
    handleAddPendingPreview,
    handleCancelPendingPreview,
    handlePreviewChange,
  };
}
