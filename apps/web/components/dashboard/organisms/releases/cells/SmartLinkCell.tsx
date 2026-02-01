'use client';

import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface SmartLinkCellProps {
  readonly release: ReleaseViewModel;
}

/**
 * SmartLinkCell - Display smart link URL with copy functionality
 *
 * Features:
 * - Shows full smart link URL in input-style container
 * - Copy button with visual feedback
 * - Click to select URL text
 *
 * Note: Clipboard write is handled by CopyLinkInput component.
 * This component only shows the toast notification.
 */
export const SmartLinkCell = memo(function SmartLinkCell({
  release,
}: SmartLinkCellProps) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const smartLinkTestId = `smart-link-copy-${release.id}`;

  // Show toast on copy - clipboard write is handled by CopyLinkInput
  const handleCopySuccess = useCallback(() => {
    toast.success(`${release.title} smart link copied`, {
      id: smartLinkTestId,
    });
  }, [release.title, smartLinkTestId]);

  return (
    <CopyLinkInput
      url={smartLinkUrl}
      size='sm'
      stopPropagation
      onCopy={handleCopySuccess}
      testId={smartLinkTestId}
    />
  );
});
