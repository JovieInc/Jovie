'use client';

import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { CopyLinkInput } from '@/components/dashboard/atoms/CopyLinkInput';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface SmartLinkCellProps {
  readonly release: ReleaseViewModel;
  /** When true, shows a locked state instead of the copyable link */
  readonly locked?: boolean;
}

/**
 * SmartLinkCell - Display smart link URL with copy functionality
 *
 * Features:
 * - Shows full smart link URL in input-style container
 * - Copy button with visual feedback
 * - Click to select URL text
 * - Locked state for free-tier gating (lock icon + upgrade hint)
 *
 * Note: Clipboard write is handled by CopyLinkInput component.
 * This component only shows the toast notification.
 */
export const SmartLinkCell = memo(function SmartLinkCell({
  release,
  locked = false,
}: SmartLinkCellProps) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
  const smartLinkTestId = `smart-link-copy-${release.id}`;

  // Show toast on copy - clipboard write is handled by CopyLinkInput
  const handleCopySuccess = useCallback(() => {
    toast.success(`${release.title} smart link copied`, {
      id: smartLinkTestId,
    });
  }, [release.title, smartLinkTestId]);

  if (locked) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 h-7 px-2 rounded-md',
          'bg-surface-1 border border-subtle',
          'text-xs text-tertiary-token select-none'
        )}
        title='Upgrade to Pro to unlock this smart link'
        data-testid={`smart-link-locked-${release.id}`}
      >
        <Icon name='Lock' className='h-3 w-3 shrink-0' aria-hidden='true' />
        <span className='truncate'>Smart link (Pro)</span>
      </div>
    );
  }

  return (
    <CopyLinkInput
      url={smartLinkUrl}
      size='sm'
      stopPropagation
      onCopy={handleCopySuccess}
      testId={smartLinkTestId}
    />
  );
});
