'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

export interface ProviderCopyButtonProps {
  readonly testId: string;
  readonly path: string | undefined;
  readonly releaseTitle: string;
  readonly providerLabel: string;
  readonly isCopied: boolean;
  readonly isManual: boolean;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<void>;
}

/**
 * Copy button for available provider links
 */
export function ProviderCopyButton({
  testId,
  path,
  releaseTitle,
  providerLabel,
  isCopied,
  isManual,
  onCopy,
}: Readonly<ProviderCopyButtonProps>) {
  // Determine button label based on state
  const getButtonLabel = (): string => {
    if (isCopied) return 'Copied!';
    if (isManual) return 'Custom';
    return 'Detected';
  };
  const buttonLabel = getButtonLabel();

  return (
    <button
      type='button'
      data-testid={testId}
      data-url={path ? `${getBaseUrl()}${path}` : undefined}
      onClick={() => {
        if (!path) return;
        void onCopy(path, `${releaseTitle} – ${providerLabel}`, testId);
      }}
      className={cn(
        'group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
        isCopied
          ? 'bg-green-100 text-success dark:bg-green-900/30 dark:text-success'
          : 'text-secondary-token hover:bg-surface-2 hover:text-primary-token'
      )}
    >
      <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
        <Icon
          name='Copy'
          className={cn(
            'absolute h-3.5 w-3.5 transition-all duration-150',
            isCopied
              ? 'scale-50 opacity-0'
              : 'scale-100 opacity-0 group-hover/btn:opacity-100'
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
      <span className='line-clamp-1'>{buttonLabel}</span>
    </button>
  );
}
