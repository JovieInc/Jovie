'use client';

import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
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

export const SmartLinkCell = memo(function SmartLinkCell({
  release,
  locked = false,
  lockReason,
}: SmartLinkCellProps) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;

  const handleCopySuccess = useCallback(() => {
    toast.success(`${release.title} smart link copied`, {
      id: `smart-link-copy-${release.id}`,
    });
  }, [release.title, release.id]);

  if (locked) {
    const isScheduled = lockReason === 'scheduled';
    return (
      <div
        className={cn(
          'flex h-[24px] items-center gap-1 rounded-[7px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-2',
          'text-[11px] font-[450] tracking-[-0.01em] text-(--linear-text-tertiary) select-none transition-[background-color,border-color,color] duration-150'
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
    <CopyableUrlRow
      url={smartLinkUrl}
      displayValue={release.smartLinkPath}
      className='h-[22px] min-w-[116px] rounded-[7px] px-1.5'
      valueClassName='text-[10px]'
      onCopySuccess={handleCopySuccess}
      copyButtonTitle='Copy smart link'
      openButtonTitle='Open smart link'
    />
  );
});
