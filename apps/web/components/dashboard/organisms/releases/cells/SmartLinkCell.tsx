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
      onClick={e => {
        e.stopPropagation(); // Prevent row click from opening sidebar
        handleCopyWithFeedback(
          release.smartLinkPath,
          `${release.title} smart link`,
          smartLinkTestId
        ).catch(() => {});
      }}
      className={cn(
        'inline-flex items-center text-xs transition-colors',
        isCopied &&
          'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/30'
      )}
    >
      <span className='relative mr-1 flex h-3.5 w-3.5 items-center justify-center'>
        <Icon
          name='Link'
          className={cn(
            'absolute h-3.5 w-3.5 transition-all duration-150',
            isCopied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
          )}
          aria-hidden='true'
        />
        <Icon
          name='Check'
          className={cn(
            'absolute h-3.5 w-3.5 transition-all duration-150',
            isCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          )}
          aria-hidden='true'
        />
      </span>
      <span className='line-clamp-1'>{isCopied ? 'Copied!' : 'Copy link'}</span>
    </Button>
  );
}
