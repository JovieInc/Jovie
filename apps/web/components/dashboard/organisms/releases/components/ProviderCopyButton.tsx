'use client';

import { Icon } from '@/components/atoms/Icon';
import { DrawerButton } from '@/components/molecules/drawer';
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
    <DrawerButton
      data-testid={testId}
      data-url={path ? `${getBaseUrl()}${path}` : undefined}
      onClick={() => {
        if (!path) return;
        void onCopy(path, `${releaseTitle} – ${providerLabel}`, testId);
      }}
      tone={isCopied ? 'secondary' : 'ghost'}
      size='sm'
      className={cn(
        'group/btn inline-flex items-center gap-1.5 rounded-[8px] border border-transparent px-2 py-1 text-[13px] transition-[background-color,border-color,color] duration-150',
        isCopied
          ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'text-(--linear-text-secondary) hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-primary-token'
      )}
    >
      <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
        <Icon
          name='Copy'
          className={cn(
            'absolute h-3 w-3 transition-all duration-150',
            isCopied
              ? 'scale-50 opacity-0'
              : 'scale-100 opacity-0 group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100'
          )}
          aria-hidden='true'
        />
        <Icon
          name='Check'
          className={cn(
            'absolute h-3 w-3 transition-all duration-150',
            isCopied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          )}
          aria-hidden='true'
        />
      </span>
      <span className='line-clamp-1'>{buttonLabel}</span>
    </DrawerButton>
  );
}
