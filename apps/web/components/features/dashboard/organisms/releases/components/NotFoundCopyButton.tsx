'use client';

// @coverage-via apps/web/tests/components/dashboard/organisms/releases/cells/ProviderCell.interaction.test.tsx

import { Button } from '@jovie/ui';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface NotFoundCopyButtonProps {
  readonly testId: string;
  readonly releaseTitle: string;
  readonly smartLinkPath: string;
  readonly isCopied: boolean;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<void>;
}

/**
 * Fallback copy button for missing provider links
 */
export const NotFoundCopyButton = memo(function NotFoundCopyButton({
  testId,
  releaseTitle,
  smartLinkPath,
  isCopied,
  onCopy,
}: Readonly<NotFoundCopyButtonProps>) {
  return (
    <Button
      type='button'
      variant={isCopied ? 'secondary' : 'ghost'}
      size='sm'
      className='group/btn'
      onClick={() =>
        void onCopy(smartLinkPath, `${releaseTitle} smart link`, testId)
      }
    >
      <Icon
        name={isCopied ? 'Check' : 'Copy'}
        className={cn(
          'h-3 w-3 transition-opacity',
          isCopied ? 'text-success' : undefined,
          isCopied
            ? 'opacity-100'
            : 'opacity-0 group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100'
        )}
        aria-hidden='true'
      />
      <span
        className={cn(
          'line-clamp-1',
          isCopied ? 'text-success' : 'text-tertiary-token'
        )}
      >
        {isCopied ? 'Copied!' : '—'}
      </span>
    </Button>
  );
});
