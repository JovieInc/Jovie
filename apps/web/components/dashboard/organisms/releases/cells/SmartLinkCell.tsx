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
  /** Reason the smartlink is locked — determines icon and label */
  readonly lockReason?: 'scheduled' | 'cap' | null;
}

/**
 * SmartLinkCell - Display smart link URL with copy functionality
 *
 * Features:
 * - Shows full smart link URL in input-style container
 * - Copy button with visual feedback
 * - Click to select URL text
 * - Locked state for free-tier gating (lock icon + upgrade hint)
 * - Scheduled state for unreleased content (clock icon + "Scheduled")
 *
 * Note: Clipboard write is handled by CopyLinkInput component.
 * This component only shows the toast notification.
 */
export const SmartLinkCell = memo(function SmartLinkCell({
  release,
  locked = false,
  lockReason,
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
    const isScheduled = lockReason === 'scheduled';
    return (
      <div
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3',
          'text-[12px] font-[450] tracking-[-0.01em] text-(--linear-text-tertiary) select-none'
        )}
        title={
          isScheduled
            ? 'Smart link goes live on release day. Upgrade to Pro for pre-release pages.'
            : 'Upgrade to Pro to unlock this smart link'
        }
        data-testid={`smart-link-locked-${release.id}`}
      >
        <Icon
          name={isScheduled ? 'Clock' : 'Lock'}
          className='h-3 w-3 shrink-0'
          aria-hidden='true'
        />
        <span className='truncate'>
          {isScheduled ? 'Scheduled' : 'Smart link (Pro)'}
        </span>
      </div>
    );
  }

  return (
    <CopyLinkInput
      url={smartLinkUrl}
      displayValue={release.smartLinkPath}
      size='sm'
      className='min-w-[180px]'
      inputClassName='h-8 rounded-full border-(--linear-border-subtle) bg-(--linear-bg-surface-1) pl-3 pr-9 text-[12px] font-[450] tracking-[-0.01em] text-(--linear-text-secondary) hover:border-(--linear-border-default) focus-visible:border-(--linear-border-focus) focus-visible:ring-0'
      buttonClassName='right-1 h-6 w-6 rounded-full p-0 text-(--linear-text-tertiary) hover:bg-(--linear-bg-surface-2) hover:text-(--linear-text-primary)'
      stopPropagation
      onCopy={handleCopySuccess}
      testId={smartLinkTestId}
    />
  );
});
