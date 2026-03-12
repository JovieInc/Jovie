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
        'group/btn inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-transparent px-2.5 text-[11px] font-[450] transition-[background-color,border-color,color] duration-150',
        isCopied
          ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'text-(--linear-text-tertiary) hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
      )}
      onClick={() =>
        void onCopy(smartLinkPath, `${releaseTitle} smart link`, testId)
      }
    >
      <Icon
        name={isCopied ? 'Check' : 'Copy'}
        className={cn(
          'h-3 w-3 transition-opacity',
          isCopied
            ? 'opacity-100'
            : 'opacity-0 group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100'
        )}
        aria-hidden='true'
      />
      <span
        className={cn(
          'line-clamp-1',
          isCopied ? 'text-inherit' : 'text-(--linear-text-tertiary)'
        )}
      >
        {isCopied ? 'Copied!' : '—'}
      </span>
    </button>
  );
});
