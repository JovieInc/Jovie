'use client';

import { Button } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface SmartLinkCellProps {
  release: ReleaseViewModel;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
}

/**
 * SmartLinkCell - Copy smart link button with visual feedback
 *
 * Features:
 * - Copy smart link to clipboard
 * - Visual feedback (green background) when copied
 * - Automatic reset after 2 seconds
 */
export function SmartLinkCell({ release, onCopy }: SmartLinkCellProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyWithFeedback = useCallback(
    async (path: string, label: string, testId: string) => {
      await onCopy(path, label, testId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    },
    [onCopy]
  );

  const smartLinkTestId = `smart-link-copy-${release.id}`;

  return (
    <Button
      variant='secondary'
      size='sm'
      data-testid={smartLinkTestId}
      data-url={`${getBaseUrl()}${release.smartLinkPath}`}
      onClick={() =>
        void handleCopyWithFeedback(
          release.smartLinkPath,
          `${release.title} smart link`,
          smartLinkTestId
        )
      }
      className={cn(
        'inline-flex items-center text-xs transition-colors',
        isCopied &&
          'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/30'
      )}
    >
      <Icon
        name={isCopied ? 'Check' : 'Link'}
        className='mr-1 h-3.5 w-3.5'
        aria-hidden='true'
      />
      <span className='line-clamp-1'>{isCopied ? 'Copied!' : 'Copy link'}</span>
    </Button>
  );
}
