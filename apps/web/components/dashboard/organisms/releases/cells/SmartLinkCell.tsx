'use client';

import { useCallback } from 'react';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface SmartLinkCellProps {
  release: ReleaseViewModel;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
}

/**
 * SmartLinkCell - Display smart link URL with copy functionality
 *
 * Features:
 * - Shows full smart link URL in input-style container
 * - Copy button with visual feedback
 * - Click to select URL text
 */
export function SmartLinkCell({ release, onCopy }: SmartLinkCellProps) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const smartLinkTestId = `smart-link-copy-${release.id}`;

  const handleCopy = useCallback(() => {
    void onCopy(
      release.smartLinkPath,
      `${release.title} smart link`,
      smartLinkTestId
    );
  }, [onCopy, release.smartLinkPath, release.title, smartLinkTestId]);

  return (
    /* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: stopPropagation prevents row click from firing */
    <div className='contents' onClick={e => e.stopPropagation()}>
      <CopyLinkInput
        url={smartLinkUrl}
        size='sm'
        onCopy={handleCopy}
        testId={smartLinkTestId}
      />
    </div>
  );
}
