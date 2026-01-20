'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface SmartLinkCellProps {
  release: ReleaseViewModel;
  /** @deprecated Not used - clipboard write happens in CopyLinkInput */
  onCopy?: (path: string, label: string, testId: string) => Promise<string>;
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
export function SmartLinkCell({ release }: SmartLinkCellProps) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const smartLinkTestId = `smart-link-copy-${release.id}`;

  // Show toast on copy - clipboard write is handled by CopyLinkInput
  const handleCopySuccess = useCallback(() => {
    toast.success(`${release.title} smart link copied`, {
      id: smartLinkTestId,
    });
  }, [release.title, smartLinkTestId]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Wrapper stops propagation for copy input
    <div
      className='contents'
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      role='presentation'
    >
      <CopyLinkInput
        url={smartLinkUrl}
        size='sm'
        onCopy={handleCopySuccess}
        testId={smartLinkTestId}
      />
    </div>
  );
}
