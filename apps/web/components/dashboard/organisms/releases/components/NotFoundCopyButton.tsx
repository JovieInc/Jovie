'use client';

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
    <button
      type='button'
      className={cn(
        'group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        isCopied
          ? 'bg-green-100 text-success dark:bg-green-900/30 dark:text-success'
          : 'text-tertiary-token hover:bg-surface-2 hover:text-primary-token'
      )}
      onClick={() =>
        void onCopy(smartLinkPath, `${releaseTitle} smart link`, testId)
      }
    >
      <Icon
        name={isCopied ? 'Check' : 'Copy'}
        className={cn(
          'h-3.5 w-3.5 transition-opacity',
          isCopied ? 'opacity-100' : 'opacity-0 group-hover/btn:opacity-100'
        )}
        aria-hidden='true'
      />
      <span className='line-clamp-1 text-tertiary-token/50'>
        {isCopied ? 'Copied!' : '—'}
      </span>
    </button>
  );
});
