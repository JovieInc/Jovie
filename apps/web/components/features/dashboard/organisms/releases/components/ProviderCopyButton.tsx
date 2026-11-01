'use client';

// @coverage-via apps/web/tests/components/dashboard/organisms/releases/cells/ProviderCell.interaction.test.tsx

import { Button } from '@jovie/ui';
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
    <Button
      data-testid={testId}
      data-url={path ? `${getBaseUrl()}${path}` : undefined}
      onClick={() => {
        if (!path) return;
        void onCopy(path, `${releaseTitle} – ${providerLabel}`, testId);
      }}
      variant={isCopied ? 'secondary' : 'ghost'}
      size='sm'
      className='group/btn'
    >
      <span
        className={cn(
          'relative flex h-3.5 w-3.5 items-center justify-center',
          isCopied ? 'text-success' : undefined
        )}
      >
        <Icon
          name='Copy'
          className={cn(
            'absolute h-3 w-3 transition-opacity duration-subtle',
            isCopied
              ? 'opacity-0'
              : 'opacity-0 group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100'
          )}
          aria-hidden='true'
        />
        <Icon
          name='Check'
          className={cn(
            'absolute h-3 w-3 transition-opacity duration-subtle',
            isCopied ? 'opacity-100' : 'opacity-0'
          )}
          aria-hidden='true'
        />
      </span>
      <span
        className={cn('line-clamp-1', isCopied ? 'text-success' : undefined)}
      >
        {buttonLabel}
      </span>
    </Button>
  );
}
